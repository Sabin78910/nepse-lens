interface SWContainer {
  register(url: string): Promise<unknown>;
}

/** Registers the service worker, only in production builds. Returns whether it tried. */
export function registerServiceWorker(
  isProd: boolean,
  container: SWContainer | undefined,
): boolean {
  if (!isProd || !container) return false;
  container.register("./sw.js").catch(() => {
    // Offline support is best-effort; the app works without it.
  });
  return true;
}
