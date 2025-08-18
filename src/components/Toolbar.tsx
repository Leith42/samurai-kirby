import VolumeSlider from "./VolumeSlider";
import RebindControl from "./RebindControl";

interface ToolbarProps {
  status:
    | "idle"
    | "joining"
    | "lobby"
    | "staring"
    | "waiting"
    | "signaled"
    | "result";
  isHost: boolean;
  linkCopied: boolean;
  volume: number;
  rebindListening: boolean;
  rebindBindingLabel: string;
  onLeaveRoom: () => void;
  onCopyInvite: () => void;
  onForceStop: () => void;
  onChangeVolume: (vol: number) => void;
  onInputVolume: (vol: number) => void;
  onStartRebind: () => void;
}

export default function Toolbar({
  status,
  isHost,
  linkCopied,
  volume,
  rebindListening,
  rebindBindingLabel,
  onLeaveRoom,
  onCopyInvite,
  onForceStop,
  onChangeVolume,
  onInputVolume,
  onStartRebind,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      {status === "lobby" && (
        <>
          <button
            className="snes-button snes-font"
            onClick={onLeaveRoom}
            title="Leave the room"
          >
            Leave Lobby
          </button>
          <button
            className="snes-button snes-font"
            onClick={onCopyInvite}
            disabled={linkCopied}
          >
            {!linkCopied ? "Copy Invite Link" : "Link Copied!"}
          </button>
        </>
      )}
      {isHost && status !== "lobby" && (
        <button
          className="snes-button snes-font"
          onClick={onForceStop}
          title="Return to lobby"
        >
          Stop Match
        </button>
      )}
      <VolumeSlider
        value={volume}
        onChangeVolume={onChangeVolume}
        onInputVolume={onInputVolume}
      />
      <RebindControl
        listening={rebindListening}
        bindingLabel={rebindBindingLabel}
        onStartRebind={onStartRebind}
      />
    </div>
  );
}
