export default function VolumeSlider({
  value,
  onChangeVolume,
  onInputVolume,
}: {
  value: number; // 0..1
  onChangeVolume: (v: number) => void;
  onInputVolume?: (v: number) => void;
}) {
  const toRange = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const fromRange = (n: number) => Math.max(0, Math.min(100, n)) / 100;

  return (
    <div className="topbar-audio snes-font">
      <div className="text-12 mb-2">Volume </div>

      <input
        type="range"
        min={0}
        max={100}
        value={toRange(value)}
        onChange={(e) => {
          const v = fromRange(Number(e.target.value));
          onChangeVolume(v);
        }}
        onInput={(e) => {
          const v = fromRange(Number((e.target as HTMLInputElement).value));
          onInputVolume?.(v);
        }}
        aria-label="Volume"
      />
    </div>
  );
}
