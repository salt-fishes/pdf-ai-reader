import { useSyncExternalStore } from "react";

let currentRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
const listeners = new Set<() => void>();
let resolution: MediaQueryList | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

function update() {
  const next = window.devicePixelRatio || 1;
  if (next === currentRatio) return;
  currentRatio = next;
  for (const listener of listeners) listener();
  watchResolution();
}

function watchResolution() {
  if (typeof window === "undefined") return;
  resolution?.removeEventListener("change", update);
  resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  resolution.addEventListener("change", update);
}

function subscribe(listener: () => void) {
  if (!listeners.size) {
    watchResolution();
    window.addEventListener("resize", update);
    // Chromium's device emulation and some remote-desktop setups change DPR
    // without firing a media-query or resize event, so keep a cheap heartbeat.
    poll = setInterval(update, 500);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      resolution?.removeEventListener("change", update);
      resolution = null;
      window.removeEventListener("resize", update);
      if (poll) clearInterval(poll);
      poll = null;
    }
  };
}

/**
 * Live devicePixelRatio. Browser zoom and moving the window to another monitor
 * change it without changing the CSS viewport, so a canvas rendered once would
 * otherwise stay at the old resolution and get upscaled (blurry) by the
 * compositor.
 */
export function usePixelRatio(): number {
  return useSyncExternalStore(
    subscribe,
    () => currentRatio,
    () => 1,
  );
}
