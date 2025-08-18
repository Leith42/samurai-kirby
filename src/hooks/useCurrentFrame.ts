import { useMemo } from "react";
import frame1 from "../assets/img/frame1.png";
import frame2 from "../assets/img/frame2.png";
import frame3a from "../assets/img/frame3a.png";
import frame3b from "../assets/img/frame3b.png";
import type { Player } from "../types";

interface Params {
  playerId: string | null;
  status:
    | "idle"
    | "joining"
    | "lobby"
    | "staring"
    | "waiting"
    | "signaled"
    | "result";
  winnerId: string | null;
  players: Player[];
}

export default function useCurrentFrame({
  playerId,
  status,
  winnerId,
  players,
}: Params) {
  return useMemo(() => {
    if (!playerId) return frame1;
    if (status === "lobby") return frame1;
    if (status === "staring") return frame1;
    if (status === "waiting") return frame1;
    if (status === "signaled") return frame2;
    if (status === "result") {
      if (winnerId) {
        if (players[0]?.id === winnerId) return frame3a;
        if (players[1]?.id === winnerId) return frame3b;
      }
      return frame1;
    }
    return frame1;
  }, [playerId, status, winnerId, players]);
}
