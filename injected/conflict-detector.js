// Runs in the page (MAIN world) at document_idle, after the engine has had its chance to hook.
(() => {
  const source = "twitchadsblocker-conflict-detector";
  const ownEngineActive = window.__twitchAdsBlockerActive === true;
  const markers = [];

  const addMarker = (name, details) => {
    markers.push({ name, details });
  };

  try {
    // Another VAFT/TwitchAdSolutions copy got there first, so ours skipped itself.
    if (!ownEngineActive && typeof window.twitchAdSolutionsVersion !== "undefined") {
      addMarker(
        "twitchAdSolutionsVersion",
        `window.twitchAdSolutionsVersion=${String(window.twitchAdSolutionsVersion)}`
      );
    }
  } catch {
    // Ignore access edge cases.
  }

  try {
    // Our hooked Worker class contains "twitchBlobUrl"; anything else non-native is a foreign hook.
    const workerString = Function.prototype.toString.call(window.Worker);
    const isNative = workerString.includes("[native code]");
    const isOurs = workerString.includes("twitchBlobUrl");
    if (!isNative && !isOurs) {
      addMarker("workerPatched", workerString.slice(0, 140));
    }
  } catch {
    // Ignore if Worker cannot be inspected.
  }

  window.postMessage(
    {
      source,
      hasConflict: markers.length > 0,
      markers,
      checkedAt: Date.now(),
      url: window.location.href
    },
    "*"
  );
})();
