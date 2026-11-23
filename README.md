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

After editing the bridge renderer, model, workshop code, or workshop textures, update the file-URL bundle.

```sh
npm exec --yes --package=esbuild@0.25.11 -- node scripts/bundle-bridge-local.mjs
```

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Page content, programme, and registration links |
| `style.css`, `theme.css` | Layout, responsive styles, and typography |
| `app.js` | Programme dialogs, mobile navigation, and calendar download |
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

The intro plays on first visit and on reload. Use `?intro=1` to replay it on demand, or set `data-ice-intro="off"` in `index.html` to disable it. Visitors can dismiss it with **Skip Intro** or **Escape**, and the site bypasses it when their browser requests reduced motion.

## Credits

The opening animation uses the ICE GIK Student Chapter banner. Campaign images are AI-generated illustrations, including the conceptual tied-arch bridge on the homepage. Instrument Sans and Instrument Serif are bundled with their licences in [assets/fonts](assets/fonts/).

The workshop uses Poly Haven's CC0 [Carpentry Shop 01](https://polyhaven.com/a/carpentry_shop_01) panorama by Greg Zaal, [Plywood](https://polyhaven.com/a/plywood) by Rob Tuytel, and [Wood Planks](https://polyhaven.com/a/wood_planks) by Amal Kumar. The maps are resized and repacked for the browser. Three.js 0.179.1 and its add-ons are distributed under the [MIT licence](vendor/three-LICENSE.txt).
