<p align="center">
  <img src="icons/icon128.png" alt="Twitch Ads Blocker" width="80" />
</p>

<h1 align="center">Twitch Ads Blocker</h1>

<p align="center">
  Chrome &amp; Firefox extension (Manifest V3) that blocks Twitch ads<br/>
  using the <strong>VAFT</strong> (Video Ad-Free Twitch) engine with performance and quality improvements.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blueviolet" alt="MV3" />
  <img src="https://img.shields.io/badge/engine-VAFT%20v37-9147ff" alt="VAFT v37" />
  <img src="https://img.shields.io/badge/chrome-%E2%9C%93-brightgreen" alt="Chrome" />
  <img src="https://img.shields.io/badge/firefox-%E2%9C%93-brightgreen" alt="Firefox" />
</p>

---

## How It Works

Twitch delivers live streams via **HLS** (HTTP Live Streaming). The player requests an M3U8 playlist every few seconds containing video segment URLs. When an ad plays, Twitch injects ad segments directly into that playlist, tagged with the `stitched` marker.

This extension intercepts the stream at multiple layers:

### 1. Worker Interception

Twitch runs its player inside a Web Worker. The background script registers the VAFT engine as a **MAIN-world content script at `document_start`**, which the browser guarantees runs before any page script, so the `Worker` constructor is always replaced before Twitch creates its player. The engine is then injected into the worker blob. This allows intercepting all playlist and segment requests from within the media thread.

### 2. Backup Stream (Primary Block)

When ads appear in the playlist, the extension requests **alternative access tokens** using different player types (`embed`, `popout`, then `autoplay` as a last resort). Twitch treats these as separate sessions and frequently returns a clean, ad-free stream at **full source resolution** (`autoplay` is 360p, but it plays smoothly instead of freezing). When the ad ends, the player is reloaded once so it returns cleanly to the main stream at your selected quality.

### 3. Backup Pre-warming

The source-quality alternative streams (`embed`, `popout`) are pre-fetched as soon as the main stream starts and refreshed every 90 seconds (the new playlist is fetched before the old one is replaced, so the cache is never empty, and only one refresh timer exists per worker). When an ad hits, the switch to the clean stream is instant because tokens and playlists are already cached.

### 4. Ad Stripping

If no ad-free alternative stream is available, the extension performs **ad stripping**: ad segments are answered with an empty media segment, so the player never downloads or shows the ad.

### 5. Watchdog Recovery

An independent monitor checks the page's `<video>` element every 2 seconds. If playback stops progressing for 12 seconds (buffering included), it asks the engine for a proper Twitch player reload, up to twice, before reloading the tab. It stays out of the way while an ad break is being blocked and resets when switching channels.

### 6. Conflict Detection

After a Twitch tab loads, the extension checks whether another ad blocker (userscript, uBlock filter, another VAFT instance) has hooked the player, since running two of them breaks playback.

---

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right corner)
4. Click **Load unpacked**
5. Select the project folder

### Firefox

Requires Firefox 128+.

1. Download or clone this repository
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file inside the project folder

---

## Project Structure

```
├── manifest.json                 # MV3 extension manifest
├── background.js                 # Registers the engine (MAIN world) according to the on/off toggle
├── inject.js                     # Content script — bridges page messages to extension storage
├── watchdog.js                   # Content script — monitors playback and recovers stalls
├── popup.html                    # Popup interface
├── popup.css                     # Popup styles (Twitch-inspired dark theme)
├── popup.js                      # Popup logic with real-time status updates
├── icons/                        # Extension icons (16, 48, 128px)
└── injected/
    ├── vaft.js                   # VAFT engine — intercepts Worker, fetch, M3U8
    ├── conflict-detector.js      # Detects other active ad blockers
    └── upstream.txt              # Upstream VAFT version metadata
```

---

## Popup

<table>
<tr>
<td width="260">

The popup uses a Twitch-inspired dark theme with custom toggle switches.

- **Ad Blocking** — enable/disable ad blocking
- **Watchdog Recovery** — enable/disable automatic stall recovery
- **Conflict Check** — shows whether another ad blocker is conflicting
- **Reload Twitch Tab** — reloads the active Twitch tab

All status indicators update in real time via `storage.onChanged`.

</td>
</tr>
</table>

---

## Flow Overview

```
Twitch tab loads
  └─ vaft.js (MAIN world, document_start, registered only when enabled)
          └─ Hook Worker, fetch, visibilityState, localStorage
              └─ Twitch creates Worker → VAFT intercepts, injects code into blob
                  └─ Worker fetches .m3u8
                      ├─ No ad? → Pass through
                      └─ Has ad? → Use pre-warmed backup stream
                          ├─ Clean stream? → Use it (source resolution)
                          ├─ Still has ads? → Try next player type (embed → popout → autoplay)
                          └─ None clean? → Strip ad segments
                      └─ Ad over? → Reload player once (back to main stream)

  └─ conflict-detector.js (MAIN world, document_idle) → inject.js → storage

  └─ watchdog.js (parallel)
      └─ Monitor video.currentTime every 2s
          ├─ Stalled 12s? → Twitch player reload (×2)
          └─ Still stalled? → reload tab
```

---

## Credits

The ad blocking engine is based on [VAFT (Video Ad-Free Twitch)](https://github.com/pixeltris/TwitchAdSolutions) by **pixeltris**, with the following improvements:

- Race-free injection (MAIN-world content script registered by the background script)
- Backup stream pre-warming for instant ad-free switching
- Null crash fix in `getServerTimeFromM3u8`
- Watchdog with per-channel recovery reset
- Dark-themed popup with real-time status updates

---

## License

This project is distributed for personal and educational use. The VAFT engine is maintained by [pixeltris](https://github.com/pixeltris/TwitchAdSolutions).
