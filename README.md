# Samurai Kirby — WS Multiplayer Clone

An online multiplayer clone of the mini-game [Samurai Kirby](https://wikirby.com/wiki/Samurai_Kirby) using ws.<br>
Created as a fun weekend project 😊.<br>

<img src="/public/demo.gif" width="350">

## Stack
- Frontend: React + TypeScript + Vite
- Server: Node.js WebSocket server using `ws`

## Run locally
Prerequisites: Node.js 20+ and npm.

1) Install dependencies
```
npm install
```

2) Start the WebSocket server (default ws://localhost:3001)
```
npm run server
```

3) Start the client (Vite dev server)
```
npm run dev
```
Server URL: the client reads `VITE_WS_URL`.
- Quick override:
```
VITE_WS_URL=ws://your-host:3001 npm run dev
```
- Or copy `.env.dist` to `.env` and set `VITE_WS_URL` there.

## Build
```
npm run build
```
This produces a production build in `dist/`.

## Status
At the moment, you can only create and join a room.<br>
Here's what could be added if the mood hits me:
- Matchmaking (e.g. find a random room)
- Spectate mode
- Leaderboard
- Settings (e.g. sound, controls, customization, etc.)
- Chat (Probably not, but who knows.)

Don't hesitate to open an issue or PR if you want to contribute! 😊