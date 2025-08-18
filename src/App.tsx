import { useEffect, useMemo, useRef, useState } from "react";
import heartSvg from "./assets/img/heart.svg";
import staringImg from "./assets/img/staring.png";
import type { Player, Scores, ServerMsg } from "./types";
import DebugPanel from "./components/DebugPanel";
import SnesModal from "./components/SnesModal";
import MainMenu from "./components/MainMenu";
import Toolbar from "./components/Toolbar";
import useInputBinding from "./hooks/useInputBinding";
import useGameAudio from "./hooks/useGameAudio";
import HUDPlayer from "./components/HUDPlayer";
import useBoundAction from "./hooks/useBoundAction";
import useCurrentFrame from "./hooks/useCurrentFrame";

function App() {
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState<
    "idle" | "joining" | "lobby" | "staring" | "waiting" | "signaled" | "result"
  >("idle");
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Scores>({});
  const [round, setRound] = useState<number>(0);
  const [lastFrames, setLastFrames] = useState<Record<string, number | null>>(
    {},
  );
  const [earlyBy, setEarlyBy] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [pressedThisRound, setPressedThisRound] = useState(false);
  const [bestOf, setBestOf] = useState<number>(5);
  const [linkCopied, setLinkCopied] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [urlRoom, setUrlRoom] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [debugMirrorBoth, setDebugMirrorBoth] = useState<boolean>(false);
  const [debugShowChrono, setDebugShowChrono] = useState<boolean>(false);
  const [plannedSignalAt, setPlannedSignalAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [volume, setVolume] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const [bestFramesByPlayer, setBestFramesByPlayer] = useState<
    Record<string, number | null>
  >({});
  const [earlyCountsByPlayer, setEarlyCountsByPlayer] = useState<
    Record<string, number>
  >({});
  const [pingsByPlayer, setPingsByPlayer] = useState<Record<string, number>>(
    {},
  );
  const [winOverlay, setWinOverlay] = useState<{
    winnerId: string;
    bestOf: number;
    scores: Scores;
  } | null>(null);
  const [roomNotFoundMsg, setRoomNotFoundMsg] = useState<string | null>(null);

  const autoJoinAttemptedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Input binding and rebind flow are handled by a reusable hook
  const {
    binding,
    listening: listeningBind,
    startListening,
    label: bindingLabel,
  } = useInputBinding();

  const { applyVolumeImmediate } = useGameAudio({
    status,
    round,
    winnerId,
    players,
    muted,
    volume,
  });

  // establish websocket
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      setConnected(false);
      setError(
        (prev) => prev || "Missing VITE_WS_URL (no WebSocket URL configured)",
      );
      return;
    }
    console.info("Connecting to WebSocket at", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = (err) => {
      console.error("WebSocket error", err);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMsg;
        handleMessage(msg);
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // periodic ping to measure latency
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "ping", t: Date.now() }));
        }
      } catch {
        console.error("WebSocket error", id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [connected]);

  // read room from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    if (r) {
      setRoomId(r);
      setUrlRoom(r);
    }
  }, []);

  const handleMessage = (msg: ServerMsg) => {
    if (msg.type === "error") {
      if (
        (msg.message || "").toLowerCase() === "room not found".toLowerCase()
      ) {
        setRoomNotFoundMsg(msg.message);
        // ensure we are not stuck in joining state and clear generic error banner
        setStatus("idle");
        setError("");
      } else {
        setError(msg.message);
      }
      return;
    }
    if (msg.type === "joined") {
      setPlayerId(msg.playerId);
      setRoomId(msg.roomId);
      setStatus("lobby");
      setPlannedSignalAt(null);
      setError("");
      setRoomNotFoundMsg(null);
      // Ensure the URL contains the room id (so host gets ?room=... too)
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("room") !== msg.roomId) {
          url.searchParams.set("room", msg.roomId);
          window.history.replaceState({}, "", url.toString());
        }
      } catch (e) {
        console.error("Failed to update URL with room id", e);
      }
      return;
    }
    if (msg.type === "room_state") {
      setPlayers(msg.players);
      setScores(msg.scores);
      if (msg.state) setStatus(msg.state);
      if (msg.bestOf) setBestOf(msg.bestOf);
      if (typeof msg.hostId !== "undefined") setHostId(msg.hostId || null);
      setPlannedSignalAt(
        typeof msg.plannedSignalAt === "number" ? msg.plannedSignalAt : null,
      );
      return;
    }
    if (msg.type === "round_starting") {
      setRound(msg.round);
      setPressedThisRound(false);
      setEarlyBy(null);
      setWinnerId(null);
      setLastFrames({});
      setPlannedSignalAt(
        typeof msg.plannedSignalAt === "number" ? msg.plannedSignalAt : null,
      );
      // New match starting? reset per-match stats and hide overlay
      if (msg.round === 1) {
        setBestFramesByPlayer({});
        setEarlyCountsByPlayer({});
        setWinOverlay(null);
      }
      setStatus("staring");
      return;
    }
    if (msg.type === "signal") {
      setStatus("signaled");
      setPlannedSignalAt(null);
      return;
    }
    if (msg.type === "round_result") {
      setStatus("result");
      setEarlyBy(msg.earlyBy ?? null);
      setWinnerId(msg.winnerId ?? null);
      setLastFrames(msg.frames || {});
      setScores(msg.scores);
      setPlannedSignalAt(null);
      // Update per-match stats
      if (msg.earlyBy) {
        setEarlyCountsByPlayer((prev) => ({
          ...prev,
          [msg.earlyBy!]: (prev[msg.earlyBy!] || 0) + 1,
        }));
      }
      if (msg.frames) {
        setBestFramesByPlayer((prev) => {
          const next = { ...prev };
          for (const pid of Object.keys(msg.frames!)) {
            const fv = msg.frames![pid];
            if (typeof fv === "number") {
              const existing = next[pid];
              if (existing == null || fv < existing) next[pid] = fv;
            }
          }
          return next;
        });
      }
      return;
    }
    if (msg.type === "match_over") {
      // Open end-of-match overlay with final scores snapshot
      setWinOverlay({
        winnerId: msg.winnerId,
        bestOf: msg.bestOf,
        scores: msg.scores,
      });
      return;
    }
    if (msg.type === "pong") {
      // Round-trip time in ms. We also report it so opponent can see it.
      const rtt = Math.max(0, Date.now() - (msg.t || Date.now()));
      setPingsByPlayer((prev) =>
        playerId ? { ...prev, [playerId]: rtt } : prev,
      );
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: "report_ping", pingMs: rtt }),
          );
        }
      } catch {
        console.error("Failed to send ping report", msg);
      }
      return;
    }
    if (msg.type === "opponent_ping") {
      setPingsByPlayer((prev) => ({
        ...prev,
        [msg.playerId]: Math.max(0, Math.floor(msg.pingMs || 0)),
      }));
      return;
    }
  };

  // Auto-join when opening an invite link (?room=...) immediately
  useEffect(() => {
    if (connected && urlRoom && !playerId && !autoJoinAttemptedRef.current) {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      autoJoinAttemptedRef.current = true;
      setError("");
      setStatus("joining");
      const payload = { type: "join", roomId: urlRoom };
      wsRef.current.send(JSON.stringify(payload));
    }
  }, [connected, urlRoom, playerId]);

  const createRoom = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setError("");
    setLinkCopied(false);
    wsRef.current.send(JSON.stringify({ type: "create_room" }));
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}?room=${roomId}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  const canPress = status === "waiting" || status === "signaled";

  // Debug countdown to signal
  const countdownVisible = useMemo(
    () =>
      import.meta.env.DEV &&
      debugShowChrono &&
      plannedSignalAt != null &&
      status === "waiting",
    [debugShowChrono, plannedSignalAt, status],
  );

  useEffect(() => {
    if (!countdownVisible) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [countdownVisible]);

  const remainingMs = useMemo(
    () => (plannedSignalAt != null ? Math.max(0, plannedSignalAt - nowMs) : 0),
    [plannedSignalAt, nowMs],
  );
  const remainingSec = useMemo(
    () => Math.ceil(remainingMs / 1000),
    [remainingMs],
  );

  const doPress = () => {
    if (!canPress || pressedThisRound) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "press" }));
    if (import.meta.env.DEV && debugMirrorBoth && players.length === 2) {
      wsRef.current.send(JSON.stringify({ type: "debug_press_other" }));
    }
    setPressedThisRound(true);
  };

  // Global input: obey configurable binding (keyboard or mouse)
  useBoundAction(binding, listeningBind, doPress);

  const you = useMemo(
    () => players.find((p) => p.id === playerId) || null,
    [players, playerId],
  );

  const currentFrame = useCurrentFrame({ playerId, status, winnerId, players });

  const isHost = useMemo(() => hostId === playerId, [hostId, playerId]);
  const opponentReady = useMemo(() => {
    if (players.length < 2) return false;
    const host = players.find((p) => p.id === hostId) || null;
    const opponent =
      players.find((p) => p.id !== (host ? host.id : "")) || null;
    return !!opponent?.ready;
  }, [players, hostId]);
  const canStart = useMemo(
    () => players.length === 2 && opponentReady,
    [players.length, opponentReady],
  );
  type Outgoing = { type: string; [k: string]: unknown };
  const send = (o: Outgoing) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(o));
  };
  const setReady = (ready: boolean) => send({ type: "set_ready", ready });
  const startMatch = () => send({ type: "start_match" });
  const forceStop = () => send({ type: "force_stop" });
  const changeBestOf = (bo: number) =>
    send({ type: "set_best_of", bestOf: bo });

  const returnHome = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      console.error("Failed to clear room from URL", e);
    }
    setUrlRoom(null);
    setRoomId("");
    setError("");
    setStatus("idle");
    setRoomNotFoundMsg(null);
    autoJoinAttemptedRef.current = false;
  };

  const leaveRoom = () => {
    // Close current WS to inform server we're leaving the room, then reconnect clean.
    try {
      if (wsRef.current) {
        wsRef.current.close();
      }
    } catch {
      console.error("Failed to close WebSocket on leaveRoom");
    }
    wsRef.current = null;
    // Reset client UI back to home
    setPlayerId(null);
    setPlayers([]);
    setScores({});
    setRound(0);
    setHostId(null);
    setPlannedSignalAt(null);
    setEarlyBy(null);
    setWinnerId(null);
    setLastFrames({});
    setPressedThisRound(false);
    setBestFramesByPlayer({});
    setEarlyCountsByPlayer({});
    setPingsByPlayer({});
    setWinOverlay(null);
    returnHome();
    // Reconnect WS so main menu can create/join rooms again
    const rawWs = (
      import.meta as unknown as { env?: { VITE_WS_URL?: string } }
    ).env?.VITE_WS_URL?.trim();
    const url = rawWs || null;
    if (!url) {
      setConnected(false);
      setError(
        (prev) => prev || "Missing VITE_WS_URL (no WebSocket URL configured)",
      );
      return;
    }
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = (err) => {
        console.error("WebSocket error", err);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as ServerMsg;
          handleMessage(msg);
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };
    } catch (e) {
      console.error("Failed to reconnect WebSocket", e);
      setConnected(false);
    }
  };

  // Points display: hearts (lives). Each player starts with targetWins hearts and loses one when opponent scores.
  const targetWins = useMemo(() => Math.floor((bestOf || 5) / 2) + 1, [bestOf]);
  const p1Score = players[0] ? (scores[players[0].id] ?? 0) : 0;
  const p2Score = players[1] ? (scores[players[1].id] ?? 0) : 0;
  const p1Hearts = Math.max(0, targetWins - p2Score);
  const p2Hearts = Math.max(0, targetWins - p1Score);
  const p1Ping = useMemo(
    () => (players[0]?.id ? pingsByPlayer[players[0]!.id] : undefined),
    [players, pingsByPlayer],
  );
  const p2Ping = useMemo(
    () => (players[1]?.id ? pingsByPlayer[players[1]!.id] : undefined),
    [players, pingsByPlayer],
  );

  return (
    <div className="app-container">
      {import.meta.env.DEV && (
        <DebugPanel
          debugMirrorBoth={debugMirrorBoth}
          onChangeMirrorBoth={setDebugMirrorBoth}
          debugShowChrono={debugShowChrono}
          onChangeShowChrono={setDebugShowChrono}
          onChangeInfiniteStaring={(v) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: "debug_set_infinite_staring",
                  enable: v,
                }),
              );
            }
          }}
        />
      )}
      <h1 className="snes-font">Samurai Kirby</h1>
      {!playerId && (
        <MainMenu connected={connected} error={error} onPlay={createRoom} />
      )}

      {playerId && (
        <Toolbar
          status={status}
          isHost={isHost}
          linkCopied={linkCopied}
          volume={volume}
          rebindListening={listeningBind}
          rebindBindingLabel={bindingLabel}
          onLeaveRoom={leaveRoom}
          onCopyInvite={copyInvite}
          onForceStop={forceStop}
          onChangeVolume={(vol) => {
            const v100 = Math.round(Math.max(0, Math.min(1, vol)) * 100);
            setVolume(vol);
            if (v100 > 0 && muted) setMuted(false);
          }}
          onInputVolume={(vol) => {
            const v100 = Math.round(Math.max(0, Math.min(1, vol)) * 100);
            setVolume(vol);
            if (v100 > 0 && muted) setMuted(false);
            applyVolumeImmediate(vol, muted);
          }}
          onStartRebind={startListening}
        />
      )}

      {playerId && (
        <div
          className={
            "game-frame mx-auto my-8" +
            (status === "signaled" ? " shake-frame" : "")
          }
        >
          <img className="frame-image" src={currentFrame} alt="Game" />

          {status === "staring" && (
            <>
              <div className="darken-overlay" />
              <img className="staring-banner" src={staringImg} alt="Staring" />
            </>
          )}

          <HUDPlayer
            side="left"
            title={`Player 1${players[0]?.id === playerId ? " (You)" : ""}`}
            status={status}
            player={players[0]}
            isSelf={players[0]?.id === playerId}
            isHost={isHost}
            canStart={canStart}
            selfReady={!!you?.ready}
            onToggleSelfReady={() => you && setReady(!you.ready)}
            onStartMatch={startMatch}
            heartsTotal={targetWins}
            heartsLeft={p1Hearts}
            ping={p1Ping}
            isWinnerAnim={
              status === "result" && !!winnerId && players[0]?.id === winnerId
            }
            isLoserAnim={
              status === "result" &&
              !!winnerId &&
              !!players[0] &&
              players[0].id !== winnerId
            }
          />

          <HUDPlayer
            side="right"
            title={`Player 2${players[1]?.id === playerId ? " (You)" : ""}`}
            status={status}
            player={players[1]}
            isSelf={players[1]?.id === playerId}
            isHost={isHost}
            canStart={canStart}
            selfReady={!!you?.ready}
            onToggleSelfReady={() => you && setReady(!you.ready)}
            onStartMatch={startMatch}
            heartsTotal={targetWins}
            heartsLeft={p2Hearts}
            ping={p2Ping}
            isWinnerAnim={
              status === "result" && !!winnerId && players[1]?.id === winnerId
            }
            isLoserAnim={
              status === "result" &&
              !!winnerId &&
              !!players[1] &&
              players[1].id !== winnerId
            }
          />

          {status === "lobby" ? (
            <div className="hud-top-center snes-font">
              {isHost ? (
                <label>
                  BO:
                  <select
                    value={bestOf}
                    onChange={(e) => changeBestOf(Number(e.target.value))}
                    className="ml-6"
                  >
                    <option value={5}>5</option>
                    <option value={7}>7</option>
                    <option value={10}>10</option>
                  </select>
                </label>
              ) : (
                <div>BO{bestOf}</div>
              )}
            </div>
          ) : (
            <div className="hud-top-center snes-font">
              Round: {round || "-"}
            </div>
          )}
          {countdownVisible && (
            <div className="countdown-overlay snes-font">{remainingSec}s</div>
          )}

          {status === "result" &&
            (() => {
              const p0 = players[0]?.id;
              const p1 = players[1]?.id;
              const f0 = p0 ? lastFrames[p0] : null;
              const f1 = p1 ? lastFrames[p1] : null;
              const isDraw =
                !earlyBy && !winnerId && f0 != null && f1 != null && f0 === f1;
              if (winnerId) {
                return (
                  <div className="hud-signboard snes-font">
                    {lastFrames[winnerId] == null
                      ? "—"
                      : `${lastFrames[winnerId]}`}
                  </div>
                );
              }
              if (isDraw) {
                return (
                  <div className="hud-signboard snes-font">{`${f0} (draw)`}</div>
                );
              }
              return null;
            })()}

          {status === "lobby" && (
            <div className="hud-bottom snes-font">
              <span>Controls: Press {bindingLabel} only.</span>
              <span>Early press: opponent scores.</span>
            </div>
          )}

          {winOverlay && (
            <div className="overlay-modal">
              <div className="snes-panel snes-font modal-panel">
                {(() => {
                  const wId = winOverlay.winnerId;
                  const wIdx = players.findIndex((p) => p.id === wId);
                  const who =
                    wIdx >= 0
                      ? `Player ${wIdx + 1}${players[wIdx].id === playerId ? " (You)" : ""}`
                      : "Winner";
                  const char = wIdx >= 0 ? players[wIdx].char || "" : "";
                  const p0 = players[0];
                  const p1 = players[1];
                  const p0Best = p0 ? bestFramesByPlayer[p0.id] : null;
                  const p1Best = p1 ? bestFramesByPlayer[p1.id] : null;
                  const p0Early = p0 ? earlyCountsByPlayer[p0.id] || 0 : 0;
                  const p1Early = p1 ? earlyCountsByPlayer[p1.id] || 0 : 0;
                  const s0 = p0 ? winOverlay.scores[p0.id] || 0 : 0;
                  const s1 = p1 ? winOverlay.scores[p1.id] || 0 : 0;
                  return (
                    <>
                      <div className="modal-title-lg">Match Over</div>
                      <div className="modal-subtitle">
                        Winner: {who}
                        {char ? ` as ${char}` : ""} (BO{winOverlay.bestOf})
                      </div>
                      <div className="stats-grid">
                        <div className="stats-card">
                          <div className="text-16 mb-6">
                            Player 1{p0 && p0.id === playerId ? " (You)" : ""}
                          </div>
                          <div className="text-14">
                            Best reaction:{" "}
                            <b>{p0Best != null ? `${p0Best}f` : "—"}</b>
                          </div>
                          <div className="text-14">
                            Early presses: <b>{p0Early}</b>
                          </div>
                          <div className="text-14">
                            Score: <b>{s0}</b>
                          </div>
                        </div>
                        <div className="stats-card">
                          <div className="text-16 mb-6">
                            Player 2{p1 && p1.id === playerId ? " (You)" : ""}
                          </div>
                          <div className="text-14">
                            Best reaction:{" "}
                            <b>{p1Best != null ? `${p1Best}f` : "—"}</b>
                          </div>
                          <div className="text-14">
                            Early presses: <b>{p1Early}</b>
                          </div>
                          <div className="text-14">
                            Score: <b>{s1}</b>
                          </div>
                        </div>
                      </div>
                      <button
                        className="snes-button snes-font"
                        onClick={() => setWinOverlay(null)}
                      >
                        Return to Lobby
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
      {roomNotFoundMsg && (
        <SnesModal
          open={!!roomNotFoundMsg}
          title="Room not found"
          message="Please check the room ID or create a new room."
          actions={[{ label: "Return to Home", onClick: returnHome }]}
          onClose={returnHome}
        />
      )}
      <div className="site-footer snes-font">
        • Feel free to contribute{" "}
        <a
          href="https://github.com/Leith42/samurai-kirby"
          target="_blank"
          rel="noopener noreferrer"
        >
          here
        </a>
        <img src={heartSvg} alt="heart" />
      </div>
    </div>
  );
}

export default App;
