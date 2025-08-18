export default function PingBadge({ ping }: { ping: number | undefined }) {
  return (
    <div className="hud-ping text-12 hint-small" style={{ marginTop: 2 }}>
      Ping:{" "}
      {typeof ping === "number" ? `${Math.max(0, Math.floor(ping))} ms` : "—"}
    </div>
  );
}
