export default function DebugPanel({
  debugMirrorBoth,
  onChangeMirrorBoth,
  debugShowChrono,
  onChangeShowChrono,
  onChangeInfiniteStaring,
}: {
  debugMirrorBoth: boolean;
  onChangeMirrorBoth: (v: boolean) => void;
  debugShowChrono: boolean;
  onChangeShowChrono: (v: boolean) => void;
  onChangeInfiniteStaring: (v: boolean) => void;
}) {
  return (
    <div className="debug-panel snes-font">
      <div className="snes-panel">
        <div className="text-14 mb-6 text-shadow">Debug</div>
        <label className="row-center gap-6">
          <input
            type="checkbox"
            checked={debugMirrorBoth}
            onChange={(e) => onChangeMirrorBoth(e.target.checked)}
          />
          <span>Mirror Space press to opponent</span>
        </label>
        <label className="row-center gap-6 mt-6">
          <input
            type="checkbox"
            onChange={(e) => onChangeInfiniteStaring(e.target.checked)}
          />
          <span>Infinite staring phase</span>
        </label>
        <label className="row-center gap-6 mt-6">
          <input
            type="checkbox"
            checked={debugShowChrono}
            onChange={(e) => onChangeShowChrono(e.target.checked)}
          />
          <span>Show countdown to signal</span>
        </label>
      </div>
    </div>
  );
}
