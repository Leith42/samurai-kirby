export const WS_URL: string | null = (() => {
  const raw = ((import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL)?.trim();
  if (!raw) return null;
  try {
    new URL(raw);
    return raw;
  } catch {
    return null;
  }
})();
