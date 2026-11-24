# ConstructX 4.0

ConstructX is a civil engineering event organised by the ICE GIK Student Chapter at GIK Institute in Topi, Pakistan. The 4–6 December 2026 programme includes a technical workshop, model bridge and egg-drop challenges, a theme dinner, and a concert.

[Register for ConstructX](https://forms.gle/9BCeNGTWMjbiToiWA) · [Download the event guide](assets/ConstructX-4.0-Modules.pdf) · [Follow ICE GIK on Instagram](https://www.instagram.com/ice.gik/)

## About the website

The site brings the programme, venue, registration, and event contacts together in one place. Visitors can explore an interactive 3D truss, read the module details, and download the event dates to their calendar. Registration is handled through Google Forms.

## Run locally

Open `index.html` directly in a WebGL 2-capable browser, or run a local server with Python 3 from the repository root.

```sh
python -m http.server 8000
```

Open [localhost:8000](http://localhost:8000) when using the local server. The site uses HTML, CSS, and JavaScript with a bundled copy of Three.js. The checked-in local bundle lets the workshop run from a file URL. If WebGL 2 is unavailable, the section shows a preview image and explains why.

After changing the bridge code or its textures, regenerate the hosted ES module and the file-URL bundle. Run the same command after editing the homepage scripts or `style.css` to refresh their versioned URLs in `index.html`.

```sh
npm exec --yes --package=esbuild@0.25.11 -- node scripts/bundle-bridge-local.mjs
```

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Page content, programme, and registration links |
| `style.css`, `theme.css` | Layout, responsive styles, and typography |
| `app.js` | Programme dialogs, mobile navigation, and calendar download |
| `bridge-loading.js` | Predictive loading, shared asset requests, and bridge lifecycle |
| `bridge-viewer.js` | WebGL rendering, scroll scrubbing and camera |
| `bridge-model.js` | Truss members, construction order and placement |
| `bridge-workshop.js` | Workshop geometry, textures, props and lighting |
| `intro.js`, `intro.css` | Animated ICE banner and homepage transition |
| `assets/` | Campaign illustrations, bundled fonts and licences, and the event guide |

## Bridge sequence

- **Construction speed.** Edit the ordered end fractions in `bridgeTimeline` in `bridge-model.js`. Each stage starts where the preceding stage ends. Widen a stage's interval to give its members more scroll distance.
- **Scroll distance.** Change `--bridge-travel` in `style.css`. It defaults to `510svh`, or `430svh` on screens up to 640px wide. Short viewports get at least 2,600 CSS pixels so individual placements remain visible.
- **Orbit speed.** Move the end of “Checking the finished span” earlier to give the 360° inspection more distance. Keep the final end fraction at 1.
- **Debugging.** Add `?bridgeDebug=1` to a local file URL or loopback preview to show scroll progress, the current stage, the assembled member count, and the pin boundaries.

## Deployment

Serve the repository root on a static host with `index.html` as the entry point. Keep the relative paths to the stylesheets, scripts, `vendor/`, `assets/`, and `ICE Logo Banner.jfif.jpeg` intact.

The intro plays on full navigations and reloads. Visitors can dismiss it with **Skip Intro** or **Escape**. It respects the browser's reduced-motion preference. Set `data-ice-intro="off"` in `index.html` to disable it for the site.

The HTML references the scripts, stylesheet and bridge bundles by content-derived query versions. Serve the rest of the static assets with the host's normal cache validation so edits at stable URLs can be picked up. The hosted bundle loads workshop assets relative to the document, including when the site is deployed under a GitHub Pages repository path.

## Performance profiling

`scripts/profile-bridge.mjs` serves a local snapshot and collects Chrome DevTools Protocol measurements. Use Node.js 22 or newer. Set `CHROME_PATH` if Chrome is installed outside the default location.

```sh
node scripts/profile-bridge.mjs --enter-ms=10500 --warm
node scripts/profile-bridge.mjs --mobile --slow --rapid --verify
node scripts/profile-bridge.mjs --mobile --save-data --observe-ms=7000
node scripts/profile-bridge.mjs --no-webgl --verify
node scripts/profile-bridge.mjs --fail-asset=bench-normal.webp --verify
node scripts/profile-bridge.mjs --file --verify
```

Use the same flags with `--root=PATH` to profile a baseline checkout. `--base=/ICE_website/` serves the site under the GitHub Pages repository path. On Windows, `--d3d11` requests hardware acceleration and `--software` requests SwiftShader. The profile reports the renderer that actually ran. `--mobile --slow` uses a 390 × 844 viewport at 2× DPR, 1.6 Mbit/s down, 150 ms latency, and 4× CPU throttling. `--rapid` dismisses the intro and jumps to the section after 1.25 seconds or as soon as the page is parsed. `--captures=PATH` saves comparison screenshots. `--captures` and `--verify` use the debug overlay to inspect assembly stages. Use the first command for a CLS sample of the ordinary page. `--no-intro --observe-ms=7000` disables the intro in the local test response so you can isolate its effect on LCP.

Chrome reports LCP, CLS, resource timings and long tasks through its standard performance APIs. In the Performance panel, look for the `ice:` and `bridge:` user timings. Homepage readiness marks the first rendering opportunity after the intro and records the hero decode separately. Assets ready marks the completion of the workshop requests. Module fetch and import, texture decoding and upload, geometry, PMREM, shader preparation, and the warm-up draw have individual timings. Bridge entry uses the intersection timestamp. The first-frame mark uses the animation frame after the first live draw was submitted. The local server serves uncompressed files, so transfer figures will vary on a CDN.

## Credits

The opening animation uses the ICE GIK Student Chapter banner. Campaign images are AI-generated illustrations, including the conceptual tied-arch bridge on the homepage. Instrument Sans and Instrument Serif are bundled with their licences in [assets/fonts](assets/fonts/).

The workshop uses Poly Haven's CC0 [Carpentry Shop 01](https://polyhaven.com/a/carpentry_shop_01) panorama by Greg Zaal, [Plywood](https://polyhaven.com/a/plywood) by Rob Tuytel, and [Wood Planks](https://polyhaven.com/a/wood_planks) by Amal Kumar. The maps are resized and repacked for the browser. Three.js 0.179.1 and its add-ons are distributed under the [MIT licence](vendor/three-LICENSE.txt).
