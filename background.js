// Registers the VAFT engine as a MAIN-world content script at document_start.
// Unlike appending a <script src> from the isolated world (which loads async and can
// lose the race against Twitch creating its player Worker), registered MAIN-world
// scripts are guaranteed to run before any page script.
const api = globalThis.browser ?? globalThis.chrome;

const engineScript = {
  id: "vaft-engine",
  js: ["injected/vaft.js"],
  matches: ["*://*.twitch.tv/*"],
  runAt: "document_start",
  world: "MAIN",
  allFrames: false
};

const detectorScript = {
  id: "conflict-detector",
  js: ["injected/conflict-detector.js"],
  matches: ["*://*.twitch.tv/*"],
  runAt: "document_idle",
  world: "MAIN",
  allFrames: false
};

let syncing = Promise.resolve();

const syncRegistration = () => {
  syncing = syncing.then(async () => {
    try {
      const { enabled } = await api.storage.local.get({ enabled: true });
      const registered = await api.scripting.getRegisteredContentScripts();
      const ids = registered.map((script) => script.id);
      if (ids.length) {
        await api.scripting.unregisterContentScripts({ ids });
      }
      const scripts = enabled !== false ? [engineScript, detectorScript] : [detectorScript];
      await api.scripting.registerContentScripts(scripts);
    } catch (error) {
      console.error("Twitch Ads Blocker: failed to register content scripts", error);
    }
  });
  return syncing;
};

api.runtime.onInstalled.addListener(syncRegistration);
api.runtime.onStartup.addListener(syncRegistration);
api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Object.prototype.hasOwnProperty.call(changes, "enabled")) {
    syncRegistration();
  }
});
