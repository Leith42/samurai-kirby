import {useEffect, useMemo, useRef, useState} from 'react'
import frame1 from './assets/img/frame1.png'
import frame2 from './assets/img/frame2.png'
import frame3a from './assets/img/frame3a.png'
import frame3b from './assets/img/frame3b.png'
import heartSvg from './assets/img/heart.svg'
import staringImg from './assets/img/staring.png'
import fightSnd from './assets/audio/fight.mp3'
import signalSnd from './assets/audio/signal.mp3'
import kirbyHitSnd from './assets/audio/kirby-hit.mp3'
import dededeHitSnd from './assets/audio/king-dedede-hit.mp3'
import drawSnd from './assets/audio/draw.mp3'
import type {Player, Scores, ServerMsg} from './types'
import {WS_URL} from './utils/wsUrl'
import {applyAudioSettings, applyAllAudios} from './utils/audio'

function App() {
    const wsRef = useRef<WebSocket | null>(null)
    const [connected, setConnected] = useState(false)
    const [playerId, setPlayerId] = useState<string | null>(null)
    const [roomId, setRoomId] = useState('')
    const [status, setStatus] = useState<'idle' | 'joining' | 'lobby' | 'staring' | 'waiting' | 'signaled' | 'result'>('idle')
    const [players, setPlayers] = useState<Player[]>([])
    const [scores, setScores] = useState<Scores>({})
    const [round, setRound] = useState<number>(0)
    const [lastFrames, setLastFrames] = useState<Record<string, number | null>>({})
    const [earlyBy, setEarlyBy] = useState<string | null>(null)
    const [winnerId, setWinnerId] = useState<string | null>(null)
    const [pressedThisRound, setPressedThisRound] = useState(false)
    const [bestOf, setBestOf] = useState<number>(5)
    const [linkCopied, setLinkCopied] = useState(false)
    const [hostId, setHostId] = useState<string | null>(null)
    const [urlRoom, setUrlRoom] = useState<string | null>(null)
    const [error, setError] = useState<string>('')
    const autoJoinAttemptedRef = useRef(false)
    const [debugMirrorBoth, setDebugMirrorBoth] = useState<boolean>(false)
    const [debugShowChrono, setDebugShowChrono] = useState<boolean>(false)
    const [plannedSignalAt, setPlannedSignalAt] = useState<number | null>(null)
    const [nowMs, setNowMs] = useState<number>(Date.now())
    const fightAudioRef = useRef<HTMLAudioElement | null>(null)
    const signalAudioRef = useRef<HTMLAudioElement | null>(null)
    const kirbyHitAudioRef = useRef<HTMLAudioElement | null>(null)
    const dededeHitAudioRef = useRef<HTMLAudioElement | null>(null)
    const drawAudioRef = useRef<HTMLAudioElement | null>(null)
    const lastSignalRoundRef = useRef<number>(0)
    const lastHitRoundRef = useRef<number>(0)
    const lastFightRoundRef = useRef<number>(0)


    const [volume, setVolume] = useState<number>(1)
    const [muted, setMuted] = useState<boolean>(false)
    const [bestFramesByPlayer, setBestFramesByPlayer] = useState<Record<string, number | null>>({})
    const [earlyCountsByPlayer, setEarlyCountsByPlayer] = useState<Record<string, number>>({})
    const [winOverlay, setWinOverlay] = useState<{
        winnerId: string;
        bestOf: number;
        scores: Scores;
    } | null>(null)

    const [pingsByPlayer, setPingsByPlayer] = useState<Record<string, number>>({})

    // Input binding (keyboard key by code or mouse button). Persisted in localStorage.
    type InputBinding =
        | { kind: 'key'; code: string }
        | { kind: 'mouse'; button: 0 | 1 | 2 }
    const DEFAULT_BIND: InputBinding = { kind: 'key', code: 'Space' }

    const readBinding = (): InputBinding => {
        try {
            const raw = localStorage.getItem('samurai.binding')
            if (!raw) return DEFAULT_BIND
            const obj = JSON.parse(raw)
            if (obj && (obj.kind === 'key' && typeof obj.code === 'string')) return { kind: 'key', code: obj.code }
            if (obj && (obj.kind === 'mouse' && (obj.button === 0 || obj.button === 1 || obj.button === 2))) return {
                kind: 'mouse',
                button: obj.button,
            }
        } catch {/* ignore */}
        return DEFAULT_BIND
    }
    const saveBinding = (b: InputBinding) => {
        try {
            localStorage.setItem('samurai.binding', JSON.stringify(b))
        } catch {/* ignore */}
    }
    const formatBinding = (b: InputBinding): string => {
        if (b.kind === 'mouse') return b.button === 0 ? 'Mouse Left' : b.button === 1 ? 'Mouse Middle' : 'Mouse Right'
        const c = b.code
        if (c.startsWith('Key') && c.length === 4) return c.slice(3)
        if (c.startsWith('Digit') && c.length === 6) return c.slice(5)
        return c.replace('Arrow', 'Arrow ')
    }
    const [binding, setBinding] = useState<InputBinding>(() => readBinding())
    const [listeningBind, setListeningBind] = useState(false)

    useEffect(() => { saveBinding(binding) }, [binding])

    useEffect(() => {
        const fight = new Audio(fightSnd)
        fight.preload = 'auto'
        fight.loop = true
        fight.volume = 1
        fightAudioRef.current = fight

        const sig = new Audio(signalSnd)
        sig.preload = 'auto'
        signalAudioRef.current = sig

        const kh = new Audio(kirbyHitSnd)
        kh.preload = 'auto'
        kirbyHitAudioRef.current = kh

        const dd = new Audio(dededeHitSnd)
        dd.preload = 'auto'
        dededeHitAudioRef.current = dd

        const dr = new Audio(drawSnd)
        dr.preload = 'auto'
        drawAudioRef.current = dr

        return () => {
            try {
                fight.pause();
            } catch (e) {
                void e
            }
            try {
                sig.pause();
            } catch (e) {
                void e
            }
            try {
                kh.pause();
            } catch (e) {
                void e
            }
            try {
                dd.pause();
            } catch (e) {
                void e
            }
            try {
                dr.pause();
            } catch (e) {
                void e
            }
        }
    }, [])

    // Fight BGM: play in staring + waiting, stop otherwise
    useEffect(() => {
        const a = fightAudioRef.current
        if (!a) return
        if (status === 'staring' || status === 'waiting') {
            if (lastFightRoundRef.current !== round && status === 'staring') {
                a.currentTime = 0
                lastFightRoundRef.current = round
            }
            a.loop = true
            // ensure volume is applied before (re)play
            applyAudioSettings(a, muted, volume)
            const p = a.play()
            if (p) {
                p.catch((e) => {
                    void e
                })
            }
        } else {
            try {
                a.pause()
                a.currentTime = 0
            } catch (e) {
                void e
            }
        }
    }, [status, round])

    // Signal SFX: on signal state once per round
    useEffect(() => {
        if (status !== 'signaled') return
        if (lastSignalRoundRef.current === round) return
        lastSignalRoundRef.current = round
        const a = signalAudioRef.current
        if (!a) return
        try {
            a.currentTime = 0
            // ensure volume is applied before play
            applyAudioSettings(a, muted, volume)
            const p = a.play()
            if (p) {
                p.catch((e) => {
                    void e
                })
            }
        } catch (e) {
            void e
        }
    }, [status, round])

    // Hit/Draw SFX: on result once per round
    useEffect(() => {
        if (status !== 'result') return
        if (lastHitRoundRef.current === round) return
        lastHitRoundRef.current = round
        let a: HTMLAudioElement | null = null
        if (!winnerId) {
            a = drawAudioRef.current
        } else {
            if (players[0]?.id === winnerId) a = kirbyHitAudioRef.current
            else if (players[1]?.id === winnerId) a = dededeHitAudioRef.current
        }
        if (!a) return
        try {
            a.currentTime = 0
            // ensure volume is applied before play
            applyAudioSettings(a, muted, volume)
            const p = a.play()
            if (p) {
                p.catch((e) => {
                    void e
                })
            }
        } catch (e) {
            void e
        }
    }, [status, round, winnerId, players])

    // Apply global volume/mute to all audio refs
    useEffect(() => {
        applyAllAudios([
            fightAudioRef.current,
            signalAudioRef.current,
            kirbyHitAudioRef.current,
            dededeHitAudioRef.current,
            drawAudioRef.current,
        ], muted, volume)
    }, [volume, muted])

    // establish websocket
    useEffect(() => {
        const url = WS_URL
        if (!url) {
            setConnected(false)
            setError(prev => prev || 'Missing VITE_WS_URL (no WebSocket URL configured)')
            return
        }
        const ws = new WebSocket(url)
        wsRef.current = ws
        ws.onopen = () => setConnected(true)
        ws.onclose = () => setConnected(false)
        ws.onerror = (err) => {
            console.error('WebSocket error', err)
        }
        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data as string) as ServerMsg
                handleMessage(msg)
            } catch (e) {
                console.error('Failed to parse WS message', e)
            }
        }
        return () => ws.close()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // periodic ping to measure latency
    useEffect(() => {
        if (!connected) return
        const id = setInterval(() => {
            try {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'ping', t: Date.now() }))
                }
            } catch {
                /* ignore */
            }
        }, 1000)
        return () => clearInterval(id)
    }, [connected])

    // read room from URL if present
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const r = params.get('room')
        if (r) {
            setRoomId(r)
            setUrlRoom(r)
        }
    }, [])

    const handleMessage = (msg: ServerMsg) => {
        if (msg.type === 'error') {
            setError(msg.message)
            return
        }
        if (msg.type === 'joined') {
            setPlayerId(msg.playerId)
            setRoomId(msg.roomId)
            setStatus('lobby')
            setPlannedSignalAt(null)
            setError('')
            // Ensure the URL contains the room id (so host gets ?room=... too)
            try {
                const url = new URL(window.location.href)
                if (url.searchParams.get('room') !== msg.roomId) {
                    url.searchParams.set('room', msg.roomId)
                    window.history.replaceState({}, '', url.toString())
                }
            } catch (e) {
                console.error('Failed to update URL with room id', e)
            }
            return
        }
        if (msg.type === 'room_state') {
            setPlayers(msg.players)
            setScores(msg.scores)
            if (msg.state) setStatus(msg.state)
            if (msg.bestOf) setBestOf(msg.bestOf)
            if (typeof msg.hostId !== 'undefined') setHostId(msg.hostId || null)
            setPlannedSignalAt(typeof msg.plannedSignalAt === 'number' ? msg.plannedSignalAt : null)
            return
        }
        if (msg.type === 'round_starting') {
            setRound(msg.round)
            setPressedThisRound(false)
            setEarlyBy(null)
            setWinnerId(null)
            setLastFrames({})
            setPlannedSignalAt(typeof msg.plannedSignalAt === 'number' ? msg.plannedSignalAt : null)
            // New match starting? reset per-match stats and hide overlay
            if (msg.round === 1) {
                setBestFramesByPlayer({})
                setEarlyCountsByPlayer({})
                setWinOverlay(null)
            }
            setStatus('staring')
            return
        }
        if (msg.type === 'signal') {
            setStatus('signaled')
            setPlannedSignalAt(null)
            return
        }
        if (msg.type === 'round_result') {
            setStatus('result')
            setEarlyBy(msg.earlyBy ?? null)
            setWinnerId(msg.winnerId ?? null)
            setLastFrames(msg.frames || {})
            setScores(msg.scores)
            setPlannedSignalAt(null)
            // Update per-match stats
            if (msg.earlyBy) {
                setEarlyCountsByPlayer(prev => ({
                    ...prev,
                    [msg.earlyBy!]: (prev[msg.earlyBy!] || 0) + 1,
                }))
            }
            if (msg.frames) {
                setBestFramesByPlayer(prev => {
                    const next = {...prev}
                    for (const pid of Object.keys(msg.frames!)) {
                        const fv = msg.frames![pid]
                        if (typeof fv === 'number') {
                            const existing = next[pid]
                            if (existing == null || fv < existing) next[pid] = fv
                        }
                    }
                    return next
                })
            }
            return
        }
        if (msg.type === 'match_over') {
            // Open end-of-match overlay with final scores snapshot
            setWinOverlay({winnerId: msg.winnerId, bestOf: msg.bestOf, scores: msg.scores})
            return
        }
        if (msg.type === 'pong') {
            // Round-trip time in ms. We also report it so opponent can see it.
            const rtt = Math.max(0, Date.now() - (msg.t || Date.now()))
            setPingsByPlayer(prev => (playerId ? { ...prev, [playerId]: rtt } : prev))
            try {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'report_ping', pingMs: rtt }))
                }
            } catch {/* ignore */}
            return
        }
        if (msg.type === 'opponent_ping') {
            setPingsByPlayer(prev => ({ ...prev, [msg.playerId]: Math.max(0, Math.floor(msg.pingMs || 0)) }))
            return
        }
    }


    // Auto-join when opening an invite link (?room=...) immediately
    useEffect(() => {
        if (connected && urlRoom && !playerId && !autoJoinAttemptedRef.current) {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
            autoJoinAttemptedRef.current = true
            setError('')
            setStatus('joining')
            const payload = {type: 'join', roomId: urlRoom}
            wsRef.current.send(JSON.stringify(payload))
        }
    }, [connected, urlRoom, playerId])

    const createRoom = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        setError('')
        setLinkCopied(false)
        wsRef.current.send(JSON.stringify({type: 'create_room'}))
    }

    const copyInvite = async () => {
        const url = `${window.location.origin}?room=${roomId}`
        try {
            await navigator.clipboard.writeText(url)
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 1500)
        } catch {
            // fallback
            prompt('Copy this link', url)
        }
    }

    // gameplay input: obey configurable binding (keyboard or mouse)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (listeningBind) return
            if (binding.kind === 'key' && e.code === binding.code) {
                e.preventDefault()
                doPress()
            }
        }
        const onMouse = (e: MouseEvent) => {
            if (listeningBind) return
            if (binding.kind === 'mouse' && e.button === binding.button) {
                e.preventDefault()
                doPress()
            }
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('mousedown', onMouse)
        return () => {
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('mousedown', onMouse)
        }
        // eslint-disable-next- react-hooks/exhaustive-deps
    }, [binding, status, pressedThisRound, listeningBind])

    // Rebinding capture mode: next key press or mouse click sets new binding
    useEffect(() => {
        if (!listeningBind) return
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.code === 'Escape') { setListeningBind(false); return }
            setBinding({ kind: 'key', code: e.code })
            setListeningBind(false)
        }
        const onMouse = (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const btn = e.button as 0 | 1 | 2
            setBinding({ kind: 'mouse', button: btn })
            setListeningBind(false)
        }
        window.addEventListener('keydown', onKey, { capture: true })
        window.addEventListener('mousedown', onMouse, { capture: true })
        return () => {
            window.removeEventListener('keydown', onKey, true)
            window.removeEventListener('mousedown', onMouse, true)
        }
        // eslint-disable-next- react-hooks/exhaustive-deps
    }, [listeningBind])

    // Prevent context menu when right mouse button is bound
    useEffect(() => {
        if (!(binding.kind === 'mouse' && binding.button === 2)) return
        const onCtx = (e: MouseEvent) => { e.preventDefault() }
        window.addEventListener('contextmenu', onCtx)
        return () => { window.removeEventListener('contextmenu', onCtx) }
        // eslint-disable-next- react-hooks/exhaustive-deps
    }, [binding])

    const canPress = status === 'waiting' || status === 'signaled'

    // Debug countdown to signal
    const countdownVisible = useMemo(() => (
        import.meta.env.DEV && debugShowChrono && plannedSignalAt != null && status === 'waiting'
    ), [debugShowChrono, plannedSignalAt, status])

    useEffect(() => {
        if (!countdownVisible) return;
        const id = setInterval(() => setNowMs(Date.now()), 100)
        return () => clearInterval(id)
    }, [countdownVisible])

    const remainingMs = useMemo(() => (
        plannedSignalAt != null ? Math.max(0, plannedSignalAt - nowMs) : 0
    ), [plannedSignalAt, nowMs])
    const remainingSec = useMemo(() => Math.ceil(remainingMs / 1000), [remainingMs])

    const doPress = () => {
        if (!canPress || pressedThisRound) return
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({type: 'press'}))
        if (import.meta.env.DEV && debugMirrorBoth && players.length === 2) {
            wsRef.current.send(JSON.stringify({type: 'debug_press_other'}))
        }
        setPressedThisRound(true)
    }

    const you = useMemo(() => players.find(p => p.id === playerId) || null, [players, playerId])

    const currentFrame = useMemo(() => {
        if (!playerId) return frame1
        if (status === 'lobby') return frame1
        if (status === 'staring') return frame1
        if (status === 'waiting') return frame1
        if (status === 'signaled') return frame2
        if (status === 'result') {
            if (winnerId) {
                if (players[0]?.id === winnerId) return frame3a
                if (players[1]?.id === winnerId) return frame3b
            }
            return frame1
        }
        return frame1
    }, [playerId, status, winnerId, players])

    const isHost = useMemo(() => hostId === playerId, [hostId, playerId])
    const opponentReady = useMemo(() => {
        if (players.length < 2) return false
        const host = players.find(p => p.id === hostId) || null
        const opponent = players.find(p => p.id !== (host ? host.id : '')) || null
        return !!opponent?.ready
    }, [players, hostId])
    const canStart = useMemo(() => players.length === 2 && opponentReady, [players.length, opponentReady])
    type Outgoing = { type: string; [k: string]: unknown }
    const send = (o: Outgoing) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(o))
    }
    const setReady = (ready: boolean) => send({type: 'set_ready', ready})
    const startMatch = () => send({type: 'start_match'})
    const forceStop = () => send({type: 'force_stop'})
    const changeBestOf = (bo: number) => send({type: 'set_best_of', bestOf: bo})

    // Points display: hearts (lives). Each player starts with targetWins hearts and loses one when opponent scores.
    const targetWins = useMemo(() => Math.floor((bestOf || 5) / 2) + 1, [bestOf])
    const p1Score = players[0] ? (scores[players[0].id] ?? 0) : 0
    const p2Score = players[1] ? (scores[players[1].id] ?? 0) : 0
    const p1Hearts = Math.max(0, targetWins - p2Score)
    const p2Hearts = Math.max(0, targetWins - p1Score)
    const renderHearts = (heartsLeft: number) => (
        <>
            {Array.from({length: targetWins}).map((_, i) => (
                <span key={i} className={'heart-slot ' + (i < heartsLeft ? 'filled' : 'empty')}>
          <img src={heartSvg} alt="heart"/>
        </span>
            ))}
        </>
    )

    const p1Ping = useMemo(() => (players[0]?.id ? pingsByPlayer[players[0]!.id] : undefined), [players, pingsByPlayer])
    const p2Ping = useMemo(() => (players[1]?.id ? pingsByPlayer[players[1]!.id] : undefined), [players, pingsByPlayer])

    return (
        <div className="app-container">
            {import.meta.env.DEV && (
                <div className="debug-panel snes-font">
                    <div className="snes-panel">
                        <div className="text-14 mb-6 text-shadow">Debug</div>
                        <label className="row-center gap-6">
                            <input type="checkbox" checked={debugMirrorBoth}
                                   onChange={e => setDebugMirrorBoth(e.target.checked)}/>
                            <span>Mirror Space press to opponent</span>
                        </label>
                        <label className="row-center gap-6 mt-6">
                            <input type="checkbox"
                                   onChange={e => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify({
                                       type: 'debug_set_infinite_staring',
                                       enable: e.target.checked
                                   }))}/>
                            <span>Infinite staring phase</span>
                        </label>
                        <label className="row-center gap-6 mt-6">
                            <input type="checkbox" checked={debugShowChrono}
                                   onChange={e => setDebugShowChrono(e.target.checked)}/>
                            <span>Show countdown to signal</span>
                        </label>
                    </div>
                </div>
            )}
            <h1 className="snes-font">Samurai Kirby</h1>
            {!playerId && (
                <div className="snes-menu mb-12">
                    <div className="menu-box">
                        <div className="menu-title">Main Menu</div>
                        <div className="column">
                            <button className="menu-item snes-font" onClick={createRoom} disabled={!connected}>Create a
                                Lobby
                            </button>
                            <button className="menu-item snes-font" disabled>Join a Lobby</button>
                            <button className="menu-item snes-font" disabled>Leaderboard</button>
                            <button className="menu-item snes-font" disabled>Settings</button>
                        </div>
                    </div>
                    {error && (
                        <div className="error-text">{error}</div>
                    )}
                </div>
            )}

            {playerId && (
                <div className="toolbar">
                    {status === 'lobby' && (
                        <>
                            {/*<button className="snes-button snes-font" onClick={leaveLobby}*/}
                            {/*        title="Leave this lobby">Leave Lobby*/}
                            {/*</button>*/}
                            <button className="snes-button snes-font" onClick={copyInvite}>Copy Invite Link</button>
                            {linkCopied &&
                                <span className="snes-font hint-small">Copied!</span>}
                        </>
                    )}
                    {isHost && status !== 'lobby' && (
                        <button className="snes-button snes-font" onClick={forceStop} title="Return to lobby">Stop
                            Match</button>
                    )}
                    <div className="topbar-audio snes-font">
                        <div className="text-12 mb-2">Volume</div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(volume * 100)}
                            onChange={(e) => {
                                const v = Math.max(0, Math.min(100, Number(e.target.value)))
                                setVolume(v / 100)
                                if (v > 0 && muted) setMuted(false)
                            }}
                            onInput={(e) => {
                                const v = Math.max(0, Math.min(100, Number((e.target as HTMLInputElement).value)))
                                const vol = v / 100
                                setVolume(vol)
                                if (v > 0 && muted) setMuted(false)
                                applyAllAudios([
                                    fightAudioRef.current,
                                    signalAudioRef.current,
                                    kirbyHitAudioRef.current,
                                    dededeHitAudioRef.current,
                                    drawAudioRef.current,
                                ], muted, vol)
                            }}
                            aria-label="Volume"
                        />
                    </div>
                    <div className="topbar-controls snes-font" style={{ marginLeft: 12 }}>
                        <div className="text-12 mb-2">Control</div>
                        {!listeningBind ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="hint-small">Bind: {formatBinding(binding)}</span>
                                <button className="snes-button small" onClick={() => setListeningBind(true)}>Rebind</button>
                            </div>
                        ) : (
                            <div className="hint-small">Press a key... (Esc to cancel)</div>
                        )}
                    </div>
                </div>
            )}

            {playerId && (
                <div className={"game-frame" + (status === 'signaled' ? ' shake-frame' : '')}
                     style={{margin: '8px auto'}}>
                    <img className="frame-image" src={currentFrame} alt="Game"/>

                    {status === 'staring' && (
                        <>
                            <div className="darken-overlay"/>
                            <img className="staring-banner" src={staringImg} alt="Staring"/>
                        </>
                    )}

                    <div
                        className={"hud-player hud-left snes-font" + (status !== 'lobby' ? ' compact' : '') + (status === 'result' ? (winnerId ? (players[0]?.id === winnerId ? ' win-anim' : (players[0] ? ' lose-anim' : '')) : '') : '')}>
                        <div className="hud-player-title">Player 1{players[0]?.id === playerId ? ' (You)' : ''}</div>
                        <div className="heart-track">
                            {renderHearts(p1Hearts)}
                        </div>
                        <div className="hud-ping text-12 hint-small" style={{marginTop: 2}}>
                            Ping: {typeof p1Ping === 'number' ? `${Math.max(0, Math.floor(p1Ping))} ms` : '—'}
                        </div>
                        {status === 'lobby' ? (
                            <>
                                {!players[0] ? (
                                    <div className="hud-ready-state blink">Waiting...</div>
                                ) : players[0].id !== playerId ? (
                                    <div className="hud-ready-state">{players[0].ready ? 'Ready' : 'Unready'}</div>
                                ) : (
                                    <div style={{display: 'flex', gap: 6, marginTop: 4, justifyContent: 'center'}}>
                                        {!isHost && (
                                            <button className="snes-button small"
                                                    onClick={() => you && setReady(!you.ready)}>
                                                {you?.ready ? 'Unready' : 'Ready'}
                                            </button>
                                        )}
                                        {isHost && (
                                            <button className="snes-button small" onClick={startMatch}
                                                    disabled={!canStart}>
                                                {canStart ? 'Start' : 'Start (waiting for P2)'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>

                    <div
                        className={"hud-player hud-right snes-font" + (status !== 'lobby' ? ' compact' : '') + (status === 'result' ? (winnerId ? (players[1]?.id === winnerId ? ' win-anim' : (players[1] ? ' lose-anim' : '')) : '') : '')}>
                        <div className="hud-player-title">Player 2{players[1]?.id === playerId ? ' (You)' : ''}</div>
                        <div className="heart-track">
                            {renderHearts(p2Hearts)}
                        </div>
                        <div className="hud-ping text-12 hint-small" style={{marginTop: 2}}>
                            Ping: {typeof p2Ping === 'number' ? `${Math.max(0, Math.floor(p2Ping))} ms` : '—'}
                        </div>
                        {status === 'lobby' ? (
                            <>
                                {!players[1] ? (
                                    <div className="hud-ready-state blink">Waiting...</div>
                                ) : players[1].id !== playerId ? (
                                    <div className="hud-ready-state">{players[1].ready ? 'Ready' : 'Unready'}</div>
                                ) : (
                                    <div style={{display: 'flex', gap: 6, marginTop: 4, justifyContent: 'center'}}>
                                        {!isHost && (
                                            <button className="snes-button small"
                                                    onClick={() => you && setReady(!you.ready)}>
                                                {you?.ready ? 'Unready' : 'Ready'}
                                            </button>
                                        )}
                                        {isHost && (
                                            <button className="snes-button small" onClick={startMatch}
                                                    disabled={!canStart}>
                                                {canStart ? 'Start' : 'Start (waiting for P2)'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>


                    {status === 'lobby' ? (
                        <div className="hud-top-center snes-font">
                            {isHost ? (
                                <label>
                                    BO:
                                    <select value={bestOf} onChange={e => changeBestOf(Number(e.target.value))}
                                            className="ml-6">
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
                        <div className="hud-top-center snes-font">Round: {round || '-'}</div>
                    )}
                    {countdownVisible && (
                        <div
                            className="snes-font"
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                padding: '2px 8px',
                                background: 'rgba(0,0,0,0.6)',
                                color: '#fff',
                                borderRadius: 6,
                                fontSize: 18,
                                border: '1px solid rgba(255,255,255,0.25)',
                                zIndex: 3
                            }}>
                            {remainingSec}s
                        </div>
                    )}


                    {status === 'result' && (
                        (() => {
                            const p0 = players[0]?.id;
                            const p1 = players[1]?.id;
                            const f0 = p0 ? lastFrames[p0] : null;
                            const f1 = p1 ? lastFrames[p1] : null;
                            const isDraw = !earlyBy && !winnerId && f0 != null && f1 != null && f0 === f1;
                            if (winnerId) {
                                return (
                                    <div className="hud-signboard snes-font">
                                        {lastFrames[winnerId] == null ? '—' : `${lastFrames[winnerId]}`}
                                    </div>
                                )
                            }
                            if (isDraw) {
                                return (
                                    <div className="hud-signboard snes-font">{`${f0} (draw)`}</div>
                                )
                            }
                            return null
                        })()
                    )}

                    {status === 'lobby' && (
                        <div className="hud-bottom snes-font">
                            <span>Controls: Press {formatBinding(binding)} only.</span>
                            <span>Early press: opponent scores.</span>
                        </div>
                    )}

                    {winOverlay && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                            borderRadius: 10,
                            zIndex: 10
                        }}>
                            <div className="snes-panel snes-font"
                                 style={{minWidth: 420, maxWidth: 640, textAlign: 'center'}}>
                                {(() => {
                                    const wId = winOverlay.winnerId
                                    const wIdx = players.findIndex(p => p.id === wId)
                                    const who = wIdx >= 0 ? `Player ${wIdx + 1}${players[wIdx].id === playerId ? ' (You)' : ''}` : 'Winner'
                                    const char = wIdx >= 0 ? (players[wIdx].char || '') : ''
                                    const p0 = players[0]
                                    const p1 = players[1]
                                    const p0Best = p0 ? bestFramesByPlayer[p0.id] : null
                                    const p1Best = p1 ? bestFramesByPlayer[p1.id] : null
                                    const p0Early = p0 ? (earlyCountsByPlayer[p0.id] || 0) : 0
                                    const p1Early = p1 ? (earlyCountsByPlayer[p1.id] || 0) : 0
                                    const s0 = p0 ? (winOverlay.scores[p0.id] || 0) : 0
                                    const s1 = p1 ? (winOverlay.scores[p1.id] || 0) : 0
                                    return (
                                        <>
                                            <div style={{
                                                fontSize: 28,
                                                color: '#fff',
                                                textShadow: '2px 2px 0 #000',
                                                marginBottom: 8
                                            }}>Match Over
                                            </div>
                                            <div style={{
                                                fontSize: 22,
                                                color: '#ffef62',
                                                textShadow: '2px 2px 0 #000',
                                                marginBottom: 12
                                            }}>
                                                Winner: {who}{char ? ` as ${char}` : ''} (BO{winOverlay.bestOf})
                                            </div>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                gap: 12,
                                                marginBottom: 12
                                            }}>
                                                <div style={{
                                                    background: 'rgba(0,0,0,0.35)',
                                                    border: '2px solid rgba(255,255,255,0.85)',
                                                    borderRadius: 8,
                                                    padding: '8px 10px'
                                                }}>
                                                    <div style={{fontSize: 16, marginBottom: 6}}>Player
                                                        1{p0 && p0.id === playerId ? ' (You)' : ''}</div>
                                                    <div style={{fontSize: 14}}>Best
                                                        reaction: <b>{p0Best != null ? `${p0Best}f` : '—'}</b></div>
                                                    <div style={{fontSize: 14}}>Early presses: <b>{p0Early}</b></div>
                                                    <div style={{fontSize: 14}}>Score: <b>{s0}</b></div>
                                                </div>
                                                <div style={{
                                                    background: 'rgba(0,0,0,0.35)',
                                                    border: '2px solid rgba(255,255,255,0.85)',
                                                    borderRadius: 8,
                                                    padding: '8px 10px'
                                                }}>
                                                    <div style={{fontSize: 16, marginBottom: 6}}>Player
                                                        2{p1 && p1.id === playerId ? ' (You)' : ''}</div>
                                                    <div style={{fontSize: 14}}>Best
                                                        reaction: <b>{p1Best != null ? `${p1Best}f` : '—'}</b></div>
                                                    <div style={{fontSize: 14}}>Early presses: <b>{p1Early}</b></div>
                                                    <div style={{fontSize: 14}}>Score: <b>{s1}</b></div>
                                                </div>
                                            </div>
                                            <button className="snes-button snes-font"
                                                    onClick={() => setWinOverlay(null)}>
                                                Return to Lobby
                                            </button>
                                        </>
                                    )
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div className="site-footer snes-font">
               • Feel free to contribute <a href="https://github.com/Leith42/samurai-kirby" target="_blank" rel="noopener noreferrer">here</a> <img
                src={heartSvg} alt="heart"/>
            </div>
        </div>
    )
}

export default App
