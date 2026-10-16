// Isolated-world bridge: the engine and the conflict detector run in the page (MAIN world)
// and cannot touch extension storage, so they post messages that are persisted here.
(() => {
  const api = globalThis.chrome ?? globalThis.browser;
  if (!api?.storage?.local) {
    return;
  }

  const conflictStorageKey = "conflictInfo";
  const detectorSource = "twitchadsblocker-conflict-detector";
  const adBlockedSource = "twitchadsblocker-ad-blocked";

  let pendingAdsBlocked = 0;
  let flushScheduled = false;

  const flushAdsBlocked = async () => {
    flushScheduled = false;
    const increment = pendingAdsBlocked;
    pendingAdsBlocked = 0;
    try {
      const { adsBlocked } = await api.storage.local.get({ adsBlocked: 0 });
      await api.storage.local.set({ adsBlocked: (Number(adsBlocked) || 0) + increment });
    } catch {
      // Extension context invalidated (extension reloaded) — nothing to persist to.
    }
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || typeof data.source !== "string") {
      return;
    }

    if (data.source === adBlockedSource) {
      pendingAdsBlocked += 1;
      if (!flushScheduled) {
        flushScheduled = true;
        setTimeout(flushAdsBlocked, 500);
      }
      return;
    }

    if (data.source === detectorSource) {
      api.storage.local
        .set({
          [conflictStorageKey]: {
            hasConflict: Boolean(data.hasConflict),
            markers: Array.isArray(data.markers) ? data.markers : [],
            checkedAt: Number(data.checkedAt) || Date.now(),
            url: typeof data.url === "string" ? data.url : window.location.href
          }
        })
        .catch(() => {});
    }
  });
})();
