import {WebSocketServer} from 'ws';

const PORT = 3001;
const TICK = 1000 / 60; // 60 FPS

/** @typedef {{ id: string, ws: import('ws').WebSocket, name: string, roomId: string|null, pressedAt?: number|null, char?: string|null, ready?: boolean }} Player */
/** @typedef {{ id: string, players: Player[], scores: Record<string, number>, state: 'lobby'|'staring'|'waiting'|'signaled'|'result', round: number, timeouts: NodeJS.Timeout[], signalAt?: number, plannedSignalAt?: number|null, roundStartAt?: number|null, early?: string|null, winnerId?: string|null, frames: Record<string, number|null>, bestOf?: number, hostId?: string, debugInfiniteStaring?: boolean }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Map<import('ws').WebSocket, Player>} */
const connectionToPlayer = new Map();

function send(ws, obj) {
    try {
        ws.send(JSON.stringify(obj));
    } catch (e) {
    }
}

function sendError(ws, message) {
    send(ws, {type: 'error', message});
}

function broadcast(room, obj) {
    const data = JSON.stringify(obj);
    for (const p of room.players) {
        try {
            p.ws.send(data);
        } catch {
        }
    }
}

function ensureRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
        room = {
            id: roomId,
            players: [],
            scores: {},
            state: 'lobby',
            round: 0,
            timeouts: [],
            frames: {},
            bestOf: 5,
            hostId: undefined,
            debugInfiniteStaring: false,
            plannedSignalAt: null,
            roundStartAt: null,
        };
        rooms.set(roomId, room);
    }
    return room;
}

function clearTimers(room) {
    for (const t of room.timeouts) clearTimeout(t);
    room.timeouts.length = 0;
}

function resetRoundState(room) {
    room.state = 'staring';
    room.signalAt = undefined;
    room.plannedSignalAt = null;
    room.roundStartAt = null;
    room.early = null;
    room.winnerId = undefined;
    room.frames = Object.fromEntries(room.players.map(p => [p.id, null]));
    for (const p of room.players) p.pressedAt = null;
}

function scheduleNextRound(room) {
    if (room.players.length < 2) return;
    room.round += 1;
    resetRoundState(room);
    room.roundStartAt = Date.now();
    const totalMs = 4000 + (3000 + Math.floor(Math.random() * 12001));
    room.plannedSignalAt = room.debugInfiniteStaring ? null : (room.roundStartAt + totalMs);
    broadcast(room, {type: 'round_starting', round: room.round, plannedSignalAt: room.plannedSignalAt || undefined});
    logRoom(room, `[round ${room.round}] staring phase 4000ms`);
    if (room.debugInfiniteStaring) {
        logRoom(room, `[round ${room.round}] debugInfiniteStaring=ON; staying in 'staring' indefinitely`);
        return;
    }
    const toWaiting = setTimeout(() => {
        room.state = 'waiting';
        publishRoomState(room);
        const delayToSignal = Math.max(0, totalMs - 4000);
        logRoom(room, `[round ${room.round}] now waiting; scheduled signal in ${delayToSignal}ms (total ${totalMs}ms)`);
        const timer = setTimeout(() => issueSignal(room), delayToSignal);
        room.timeouts.push(timer);
    }, 4000);
    room.timeouts.push(toWaiting);
}

function issueSignal(room) {
    if (room.players.length < 2) return;
    if (room.early) return;
    room.state = 'signaled';
    room.signalAt = Date.now();
    logRoom(room, `[round ${room.round}] SIGNAL at ${room.signalAt}`);
    broadcast(room, {type: 'signal', t: room.signalAt});
}

function framesFromMs(ms) {
    return Math.round(ms / TICK);
}

function targetWins(room) {
    const bo = room.bestOf || 5;
    return Math.floor(bo / 2) + 1;
}

function matchWinnerId(room) {
    const tw = targetWins(room);
    for (const p of room.players) {
        if ((room.scores[p.id] || 0) >= tw) return p.id;
    }
    return null;
}

function schedulePostRound(room) {
    const winnerId = matchWinnerId(room);
    if (winnerId) {
        logRoom(room, `[match] winner=${winnerId}; final scores=` + JSON.stringify(room.scores));
        const timer = setTimeout(() => {
            broadcast(room, {type: 'match_over', bestOf: room.bestOf || 5, winnerId, scores: room.scores});
            for (const pid of Object.keys(room.scores)) room.scores[pid] = 0;
            room.round = 0;
            room.frames = {};
            room.signalAt = undefined;
            room.plannedSignalAt = null;
            room.roundStartAt = null;
            room.early = null;
            room.winnerId = undefined;
            room.state = 'lobby';
            for (const p of room.players) {
                p.ready = false;
                p.pressedAt = null;
            }
            publishRoomState(room);
        }, 4000);
        room.timeouts.push(timer);
    } else {
        logRoom(room, `[round ${room.round}] continuing to next round in 4000ms`);
        const timer = setTimeout(() => scheduleNextRound(room), 4000);
        room.timeouts.push(timer);
    }
}

function endRoundEarly(room, earlyPlayerId) {
    room.state = 'result';
    room.early = earlyPlayerId;
    const opponent = room.players.find(p => p.id !== earlyPlayerId) || null;
    room.winnerId = opponent ? opponent.id : null;
    if (opponent) {
        room.scores[opponent.id] = (room.scores[opponent.id] || 0) + 1;
    }
    logRoom(room, `[round ${room.round}] EARLY by ${earlyPlayerId}; winner=${room.winnerId || 'none'}; scores=` + JSON.stringify(room.scores));
    broadcast(room, {
        type: 'round_result',
        round: room.round,
        reason: 'early',
        earlyBy: earlyPlayerId,
        winnerId: room.winnerId,
        frames: room.frames,
        scores: room.scores,
    });
    schedulePostRound(room);
}

function concludeRoundAfterSignal(room) {
    if (room.state !== 'signaled') return;
    room.state = 'result';
    const ids = room.players.map(p => p.id);
    const f = room.frames;
    let winnerId = null;
    if (ids.length >= 2) {
        const f0 = f[ids[0]];
        const f1 = f[ids[1]];
        if (f0 != null && f1 != null) {
            if (f0 === f1) {
                winnerId = null;
            } else {
                winnerId = f0 < f1 ? ids[0] : ids[1];
            }
        } else if (f0 != null || f1 != null) {
            winnerId = f0 != null ? ids[0] : ids[1];
        }
    }
    if (winnerId) {
        room.winnerId = winnerId;
        room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
    } else {
        room.winnerId = null;
    }
    logRoom(room, `[round ${room.round}] RESULT by signal; winner=${room.winnerId || 'draw'}; frames=${JSON.stringify(room.frames)}; scores=${JSON.stringify(room.scores)}`);
    broadcast(room, {
        type: 'round_result',
        round: room.round,
        reason: 'signal',
        winnerId: room.winnerId || null,
        frames: room.frames,
        scores: room.scores,
    });
    schedulePostRound(room);
}

function onPress(room, player) {
    if (room.players.length < 2) return;
    const now = Date.now();

    if (room.state === 'staring') {
        return;
    }

    if (room.state === 'waiting') {
        logRoom(room, `[round ${room.round}] EARLY press attempt by ${player.id}`);
        clearTimers(room);
        endRoundEarly(room, player.id);
        return;
    }

    if (room.state !== 'signaled' || !room.signalAt) return;

    if (player.pressedAt == null) {
        player.pressedAt = now;
        const delta = Math.max(0, now - room.signalAt);
        const frames = framesFromMs(delta);
        room.frames[player.id] = frames;
        logRoom(room, `[round ${room.round}] press by ${player.id} delta=${delta}ms (${frames}f)`);

        const othersPressed = room.players.filter(p => p.id !== player.id).some(p => p.pressedAt != null);
        if (othersPressed) {
            concludeRoundAfterSignal(room);
        } else {
            const timer = setTimeout(() => concludeRoundAfterSignal(room), Math.ceil(TICK) + 2);
            room.timeouts.push(timer);
        }
    }
}

function assignFixedChars(room) {
    if (room.players[0]) room.players[0].char = 'Kirby';
    if (room.players[1]) room.players[1].char = 'King Dedede';
    for (let i = 2; i < room.players.length; i++) room.players[i].char = null;
}

function publishRoomState(room) {
    assignFixedChars(room);
    broadcast(room, {
        type: 'room_state',
        players: room.players.map(p => ({id: p.id, name: p.name, char: p.char || null, ready: !!p.ready})),
        scores: room.scores,
        state: room.state,
        bestOf: room.bestOf,
        hostId: room.hostId,
        plannedSignalAt: room.plannedSignalAt || undefined,
    });
}

function tryStart(room) {
    publishRoomState(room);
}

function removePlayer(player) {
    const roomId = player.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== player.id);
    delete room.scores[player.id];
    clearTimers(room);
    room.state = 'lobby';
    room.round = 0;
    room.frames = {};
    room.signalAt = undefined;
    room.plannedSignalAt = null;
    room.roundStartAt = null;
    room.early = null;
    room.winnerId = undefined;
    for (const p of room.players) {
        p.ready = false;
        p.pressedAt = null;
    }
    const oldHost = room.hostId;
    if (room.hostId === player.id) room.hostId = room.players[0]?.id;
    logRoom(room, `[leave] player ${player.id} removed; players=${room.players.map(p => p.id).join(',') || 'none'}; host ${oldHost} -> ${room.hostId}`);
    publishRoomState(room);
}

let nextId = 1;

function newId() {
    return String(nextId++);
}

function generateRoomCode() {
    let code;
    do {
        code = String(Math.floor(1000 + Math.random() * 9000));
    } while (rooms.has(code));
    return code;
}

function normalizeBestOf(v) {
    const n = Number(v);
    return n === 5 || n === 7 || n === 10 ? n : 5;
}


const wss = new WebSocketServer({
    port: PORT,
    path: '/ws'
});

function ts() {
    return new Date().toISOString();
}

function log(...args) {
    try {
        console.log(`[${ts()}]`, ...args);
    } catch {
    }
}

function logRoom(room, ...args) {
    try {
        console.log(`[${ts()}][room ${room.id}]`, ...args);
    } catch {
    }
}

log(`[server] WebSocket server listening on ${PORT}`);

wss.on('connection', (ws, req) => {
    const player = {id: newId(), ws, name: 'Player', roomId: null, char: null};
    connectionToPlayer.set(ws, player);
    const addr = (req && (req.socket?.remoteAddress || req.headers['x-forwarded-for'])) || 'unknown';
    log(`[conn open] player ${player.id} from ${addr}`);

    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(String(data));
        } catch {
            log('[recv] invalid JSON from player', player.id);
            sendError(ws, 'Invalid JSON');
            return;
        }
        if (!msg || typeof msg.type !== 'string') {
            log('[recv] invalid message from player', player.id, 'payload:', String(data));
            sendError(ws, 'Invalid message');
            return;
        }
        log(`[recv] type=${msg.type} player=${player.id} room=${player.roomId || '-'}`);

        if (msg.type === 'create_room') {
            const code = generateRoomCode();
            const room = ensureRoom(code);
            room.bestOf = room.bestOf || 5;
            room.hostId = player.id;
            if (player.roomId && player.roomId !== code) removePlayer(player);
            player.roomId = code;
            player.ready = false;
            if (!room.players.find(p => p.id === player.id)) {
                room.players.push(player);
            }
            if (!(player.id in room.scores)) room.scores[player.id] = 0;
            logRoom(room, `[create_room] by ${player.id}; host=${room.hostId}; BO${room.bestOf}`);
            send(ws, {type: 'joined', playerId: player.id, roomId: code});
            publishRoomState(room);
            return;
        }

        if (msg.type === 'join') {
            const roomId = String(msg.roomId || '').trim();
            if (!roomId) {
                log('[join] missing roomId from player', player.id);
                sendError(ws, 'roomId required');
                return;
            }
            const room = rooms.get(roomId);
            if (!room) {
                log('[join] room not found:', roomId, 'for player', player.id);
                sendError(ws, 'Room not found');
                return;
            }
            if (room.players.length >= 2 && !room.players.find(p => p.id === player.id)) {
                log('[join] room full for player', player.id, 'requested', roomId);
                sendError(ws, 'Room full');
                return;
            }
            // If switching rooms, remove from old
            if (player.roomId && player.roomId !== roomId) removePlayer(player);

            player.roomId = roomId;
            player.ready = false;
            if (!room.players.find(p => p.id === player.id)) {
                room.players.push(player);
            }
            if (!(player.id in room.scores)) room.scores[player.id] = 0;
            // Assign host if none
            if (!room.hostId) room.hostId = player.id;

            logRoom(room, `[join] player ${player.id} joined; players=${room.players.map(p => p.id).join(',')} host=${room.hostId}`);
            send(ws, {type: 'joined', playerId: player.id, roomId});
            publishRoomState(room);
            tryStart(room);
            return;
        }

        if (msg.type === 'select_character') {
            send(ws, {
                type: 'error',
                message: 'Character selection is disabled. Player 1 is Kirby, Player 2 is King Dedede.'
            });
            return;
        }

        if (msg.type === 'set_ready') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            if (room.state !== 'lobby') {
                logRoom({id: player.roomId}, `[set_ready] denied for ${player.id}: not in lobby`);
                sendError(ws, 'Can only set ready in lobby');
                return;
            }
            player.ready = !!msg.ready;
            logRoom(room, `[set_ready] player ${player.id} ready=${player.ready}`);
            publishRoomState(room);
            return;
        }

        if (msg.type === 'set_best_of') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            if (room.hostId !== player.id) {
                logRoom(room, `[set_best_of] denied: ${player.id} is not host (host=${room.hostId})`);
                sendError(ws, 'Only host can change Best-of');
                return;
            }
            if (room.state !== 'lobby') {
                logRoom(room, `[set_best_of] denied: not in lobby (state=${room.state})`);
                sendError(ws, 'Can only change Best-of in lobby');
                return;
            }
            const prev = room.bestOf;
            room.bestOf = normalizeBestOf(msg.bestOf);
            logRoom(room, `[set_best_of] by host ${player.id}: ${prev} -> ${room.bestOf}`);
            publishRoomState(room);
            return;
        }

        if (msg.type === 'start_match') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            if (room.hostId !== player.id) {
                logRoom(room, `[start_match] denied: ${player.id} is not host (host=${room.hostId})`);
                sendError(ws, 'Only host can start the match');
                return;
            }
            if (room.state !== 'lobby') {
                logRoom(room, `[start_match] denied: state=${room.state}`);
                sendError(ws, 'Match already started');
                return;
            }
            const hasBoth = room.players.length === 2;
            const opponent = room.players.find(p => p.id !== room.hostId);
            const readyToStart = !!(hasBoth && opponent && opponent.ready);
            if (!readyToStart) {
                logRoom(room, `[start_match] denied: waiting for non-host to be ready`);
                sendError(ws, 'Waiting for Player 2 to be ready');
                return;
            }
            clearTimers(room);
            // reset scores and round
            for (const p of room.players) {
                room.scores[p.id] = 0;
                p.pressedAt = null;
            }
            room.round = 0;
            logRoom(room, `[start_match] by host ${player.id}; BO${room.bestOf}; players=${room.players.map(p => p.id + ':' + (p.char || '')) + ''}`);
            scheduleNextRound(room);
            return;
        }

        if (msg.type === 'force_stop') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            if (room.hostId !== player.id) {
                logRoom(room, `[force_stop] denied: ${player.id} is not host (host=${room.hostId})`);
                sendError(ws, 'Only host can stop the match');
                return;
            }
            clearTimers(room);
            room.state = 'lobby';
            room.round = 0;
            room.frames = {};
            room.signalAt = undefined;
            room.plannedSignalAt = null;
            room.roundStartAt = null;
            room.early = null;
            room.winnerId = undefined;
            for (const p of room.players) {
                p.ready = false;
                p.pressedAt = null;
            }
            // reset scores on force stop
            for (const pid of Object.keys(room.scores)) room.scores[pid] = 0;
            logRoom(room, `[force_stop] by host ${player.id}; scores reset; back to lobby`);
            publishRoomState(room);
            return;
        }

        if (msg.type === 'debug_set_infinite_staring') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            room.debugInfiniteStaring = !!msg.enable;
            logRoom(room, `[debug] infinite staring ${room.debugInfiniteStaring ? 'ENABLED' : 'DISABLED'} by ${player.id}`);
            if (room.debugInfiniteStaring && room.state === 'staring') {
                clearTimers(room);
                room.plannedSignalAt = null;
            }
            if (!room.debugInfiniteStaring && room.state === 'staring') {
                const delay = 3000 + Math.floor(Math.random() * 12001);
                room.plannedSignalAt = Date.now() + delay;
                room.state = 'waiting';
                publishRoomState(room);
                logRoom(room, `[round ${room.round}] debug toggled off; now waiting; scheduled signal in ${delay}ms`);
                const timer = setTimeout(() => issueSignal(room), delay);
                room.timeouts.push(timer);
            }
            return;
        }

        if (msg.type === 'debug_press_other') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            const me = room.players.find(p => p.id === player.id);
            const opponent = room.players.find(p => p.id !== player.id);
            if (!opponent || !me) return;
            // Only act during signaled state to avoid early-press interference
            if (room.state !== 'signaled' || !room.signalAt) return;
            // If I already pressed, mirror my exact press time/frames to opponent
            if (me.pressedAt != null) {
                const myDelta = Math.max(0, me.pressedAt - room.signalAt);
                const f = framesFromMs(myDelta);
                opponent.pressedAt = me.pressedAt;
                room.frames[opponent.id] = f;
                logRoom(room, `[round ${room.round}] [debug] mirrored press to opponent with ${f}f for tie`);
                concludeRoundAfterSignal(room);
                return;
            }
            // Otherwise, simulate both pressing at the same moment now
            const now = Date.now();
            const delta = Math.max(0, now - room.signalAt);
            const fnow = framesFromMs(delta);
            me.pressedAt = now;
            opponent.pressedAt = now;
            room.frames[me.id] = fnow;
            room.frames[opponent.id] = fnow;
            logRoom(room, `[round ${room.round}] [debug] simulated both presses at ${fnow}f for tie`);
            concludeRoundAfterSignal(room);
            return;
        }

        if (msg.type === 'ping') {
            send(ws, {type: 'pong', t: msg.t || Date.now()});
            return;
        }

        if (msg.type === 'report_ping') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            const pingMs = Math.max(0, Math.floor(Number(msg.pingMs) || 0));
            broadcast(room, { type: 'opponent_ping', playerId: player.id, pingMs });
            return;
        }

        if (msg.type === 'press') {
            if (!player.roomId) return;
            const room = rooms.get(player.roomId);
            if (!room) return;
            onPress(room, player);
            return;
        }

        log(`[recv] unknown message type from player ${player.id}:`, msg.type);
        sendError(ws, 'Unknown message type');
    });

    ws.on('close', () => {
        const p = connectionToPlayer.get(ws);
        if (p) {
            const oldRoomId = p.roomId;
            const beforeHost = oldRoomId ? rooms.get(oldRoomId)?.hostId : undefined;
            log(`[conn close] player ${p.id} (room ${oldRoomId || '-'})`);
            connectionToPlayer.delete(ws);
            removePlayer(p);
            if (oldRoomId) {
                const r = rooms.get(oldRoomId);
                if (r && beforeHost !== r.hostId) {
                    logRoom(r, `[host] reassigned ${beforeHost} -> ${r.hostId}`);
                }
            }
        }
    });

    send(ws, {type: 'hello', message: 'Welcome to Samurai Kirby WS server'});
});
