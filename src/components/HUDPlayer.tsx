import Hearts from "./Hearts";
import PingBadge from "./PingBadge";
import type { Player } from "../types";

interface HUDPlayerProps {
  side: "left" | "right";
  title: string;
  status: "idle" | "joining" | "lobby" | "staring" | "waiting" | "signaled" | "result";
  player?: Player | null;
  isSelf: boolean;
  isHost: boolean;
  canStart: boolean;
  selfReady: boolean;
  onToggleSelfReady: () => void;
  onStartMatch: () => void;
  heartsTotal: number;
  heartsLeft: number;
  ping?: number;
  isWinnerAnim: boolean;
  isLoserAnim: boolean;
}

export default function HUDPlayer({
  side,
  title,
  status,
  player,
  isSelf,
  isHost,
  canStart,
  selfReady,
  onToggleSelfReady,
  onStartMatch,
  heartsTotal,
  heartsLeft,
  ping,
  isWinnerAnim,
  isLoserAnim,
}: HUDPlayerProps) {
  const classes =
    "hud-player snes-font " +
    (side === "left" ? "hud-left" : "hud-right") +
    (status !== "lobby" ? " compact" : "") +
    (status === "result"
      ? isWinnerAnim
        ? " win-anim"
        : isLoserAnim
        ? " lose-anim"
        : ""
      : "");

  return (
    <div className={classes}>
      <div className="hud-player-title">{title}</div>
      <div className="heart-track">
        <Hearts total={heartsTotal} left={heartsLeft} />
      </div>
      <PingBadge ping={ping} />
      {status === "lobby" ? (
        <>
          {!player ? (
            <div className="hud-ready-state blink">Waiting...</div>
          ) : !isSelf ? (
            <div className="hud-ready-state">{player.ready ? "Ready" : "Unready"}</div>
          ) : (
            <div className="btn-row">
              {!isHost && (
                <button className="snes-button small" onClick={onToggleSelfReady}>
                  {selfReady ? "Unready" : "Ready"}
                </button>
              )}
              {isHost && (
                <button className="snes-button small" onClick={onStartMatch} disabled={!canStart}>
                  {canStart ? "Start" : "Start (waiting for P2)"}
                </button>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
