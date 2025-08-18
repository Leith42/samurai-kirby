export default function RebindControl({
  listening,
  bindingLabel,
  onStartRebind,
}: {
  listening: boolean;
  bindingLabel: string;
  onStartRebind: () => void;
}) {
  return (
    <div className="topbar-controls snes-font ml-12">
      <div className="text-12 mb-2">Control</div>
      {!listening ? (
        <div className="row-center gap-6">
          <span className="hint-small">Bind: {bindingLabel}</span>
          <button className="snes-button small" onClick={onStartRebind}>
            Rebind
          </button>
        </div>
      ) : (
        <div className="hint-small">Press a key... (Esc to cancel)</div>
      )}
    </div>
  );
}
