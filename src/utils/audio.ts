export function applyAudioSettings(a: HTMLAudioElement | null, isMuted: boolean, vol: number): void {
  if (!a) return;
  try {
    a.muted = isMuted || vol === 0;
    a.volume = isMuted ? 0 : vol;
  } catch {
    // ignore
  }
}

export function applyAllAudios(arr: (HTMLAudioElement | null)[], isMuted: boolean, vol: number): void {
  for (const el of arr) applyAudioSettings(el, isMuted, vol);
}
