export type Player = { id: string; name?: string; char?: string | null; ready?: boolean };
export type Scores = Record<string, number>;

export type ServerMsg =
  | { type: 'hello'; message: string }
  | { type: 'error'; message: string }
  | { type: 'joined'; playerId: string; roomId: string }
  | {
      type: 'room_state';
      players: Player[];
      scores: Scores;
      state: 'lobby' | 'staring' | 'waiting' | 'signaled' | 'result';
      bestOf?: number;
      hostId?: string;
      plannedSignalAt?: number;
    }
  | { type: 'round_starting'; round: number; plannedSignalAt?: number }
  | { type: 'signal'; t: number }
  | {
      type: 'round_result';
      round: number;
      reason: 'early' | 'signal';
      earlyBy?: string;
      winnerId?: string | null;
      frames: Record<string, number | null>;
      scores: Scores;
    }
  | { type: 'match_over'; bestOf: number; winnerId: string; scores: Scores }
  | { type: 'pong'; t: number }
  | { type: 'opponent_ping'; playerId: string; pingMs: number };
