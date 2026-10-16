(() => {
  const api = globalThis.chrome ?? globalThis.browser;
  if (!api?.storage?.local) {
    return;
  }

  const watchdogInfoKey = "watchdogInfo";
  const checkIntervalMs = 2000;
  const stallThresholdMs = 12000;
  const recoveryCooldownMs = 30000;
  const healthyResetMs = 60000;
  const preflightMs = 15000;
  const maxPlayerReloads = 2;

  let extensionEnabled = true;
  let watchdogEnabled = true;
  let initialized = false;
  let activeVideo = null;
  let lastCurrentTime = null;
  let lastProgressAt = Date.now();
  let lastRecoveryAt = 0;
  let recoveryCount = 0;
  let isBlockingAd = false;
  let lastUrl = window.location.href;
  let lastNavigationAt = Date.now();
  let lastPublishedSignature = "";
  let currentInfo = {
    status: "starting",
    lastUpdated: Date.now(),
    recoveryCount: 0,
    url: window.location.href
  };

  const shouldWatch = () => extensionEnabled && watchdogEnabled;

  const publishInfo = (update, force) => {
    const next = {
      ...currentInfo,
      ...update,
      url: window.location.href,
      watchdogEnabled,
      extensionEnabled
    };
    const signature = JSON.stringify(next);
    if (!force && signature === lastPublishedSignature) {
      return;
    }
    lastPublishedSignature = signature;
    currentInfo = { ...next, lastUpdated: Date.now() };
    api.storage.local.set({ [watchdogInfoKey]: currentInfo }).catch(() => {});
  };

  const describeStatus = () => {
    if (!extensionEnabled) {
      return "disabled_by_extension";
    }
    if (!watchdogEnabled) {
      return "disabled_by_user";
    }
    return "waiting_for_video";
  };

  const resetProgress = (video) => {
    lastCurrentTime = Number(video?.currentTime) || 0;
    lastProgressAt = Date.now();
  };

  const pickVideo = () => {
    let best = null;
    let bestArea = -1;
    for (const video of document.querySelectorAll("video")) {
      const area = (video.clientWidth || 0) * (video.clientHeight || 0);
      if (area > bestArea) {
        best = video;
        bestArea = area;
      }
    }
    return best;
  };

  // Escalation: ask the engine for a Twitch player reload (keeps quality/volume and the
  // player's internal state consistent), and only reload the whole tab as a last resort.
  const recoverPlayback = (stallMs) => {
    recoveryCount += 1;
    lastRecoveryAt = Date.now();
    const reason = `stalled_${Math.round(stallMs / 1000)}s`;

    if (recoveryCount <= maxPlayerReloads) {
      publishInfo({
        status: "recovering",
        recoveryCount,
        stallMs,
        lastRecoveryAt,
        lastRecoveryAction: "player_reload",
        lastRecoveryReason: reason
      });
      window.postMessage({ source: "twitchadsblocker-watchdog", action: "reloadPlayer" }, "*");
      lastProgressAt = Date.now();
      return;
    }

    publishInfo({
      status: "reloading_tab",
      recoveryCount,
      stallMs,
      lastRecoveryAt,
      lastRecoveryAction: "tab_reload",
      lastRecoveryReason: reason
    });
    setTimeout(() => window.location.reload(), 50);
  };

  const tick = () => {
    if (!initialized) {
      return;
    }

    if (!shouldWatch()) {
      publishInfo({ status: describeStatus(), recoveryCount, stallMs: 0 });
      return;
    }

    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      lastNavigationAt = Date.now();
      recoveryCount = 0;
      lastRecoveryAt = 0;
      activeVideo = null;
      lastCurrentTime = null;
      lastProgressAt = Date.now();
    }

    if (Date.now() - lastNavigationAt < preflightMs) {
      publishInfo({ status: "warming_up", recoveryCount, stallMs: 0 });
      return;
    }

    const video = pickVideo();
    if (!video) {
      activeVideo = null;
      lastCurrentTime = null;
      publishInfo({ status: "waiting_for_video", recoveryCount, stallMs: 0 });
      return;
    }

    if (video !== activeVideo) {
      activeVideo = video;
      resetProgress(video);
      publishInfo({ status: "monitoring", recoveryCount, stallMs: 0 });
      return;
    }

    // Paused/ended by the user is not a stall. A low readyState while *playing* is exactly
    // what a buffering stall looks like, so it must not be treated as idle.
    if (video.paused || video.ended) {
      resetProgress(video);
      publishInfo({ status: "idle", recoveryCount, stallMs: 0 });
      return;
    }

    const currentTime = Number(video.currentTime) || 0;
    if (lastCurrentTime === null || currentTime > lastCurrentTime + 0.01) {
      lastCurrentTime = currentTime;
      lastProgressAt = Date.now();
      if (recoveryCount > 0 && Date.now() - lastRecoveryAt > healthyResetMs) {
        recoveryCount = 0;
      }
      publishInfo({ status: "monitoring", recoveryCount, stallMs: 0 });
      return;
    }

    const stallMs = Date.now() - lastProgressAt;
    publishInfo({ status: "monitoring", recoveryCount, stallMs: Math.round(stallMs / 1000) * 1000 });
    // Reloading during an ad break just lands back in the same ad; let the engine finish it.
    if (isBlockingAd || stallMs < stallThresholdMs || Date.now() - lastRecoveryAt < recoveryCooldownMs) {
      return;
    }

    recoverPlayback(stallMs);
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source === window && data && data.source === "twitchadsblocker-state") {
      isBlockingAd = Boolean(data.hasAds);
      if (!isBlockingAd) {
        lastProgressAt = Date.now();
      }
    }
  });

  api.storage.local
    .get({ enabled: true, watchdogEnabled: true })
    .catch(() => ({}))
    .then((state) => {
      extensionEnabled = state.enabled !== false;
      watchdogEnabled = state.watchdogEnabled !== false;
      initialized = true;
      publishInfo({ status: describeStatus(), recoveryCount, stallMs: 0 }, true);
    });

  setInterval(tick, checkIntervalMs);

  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(changes, "enabled")) {
      extensionEnabled = changes.enabled.newValue !== false;
    }
    if (Object.prototype.hasOwnProperty.call(changes, "watchdogEnabled")) {
      watchdogEnabled = changes.watchdogEnabled.newValue !== false;
    }
  });
})();
