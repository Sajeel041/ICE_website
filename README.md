# ConstructX 4.0

ConstructX is a civil engineering event organised by the ICE GIK Student Chapter at GIK Institute in Topi, Pakistan. The 4–6 December 2026 programme includes a technical workshop, model bridge and egg-drop challenges, a theme dinner, and a concert.

[Register for ConstructX](https://forms.gle/9BCeNGTWMjbiToiWA) · [Download the event guide](assets/ConstructX-4.0-Modules.pdf) · [Follow ICE GIK on Instagram](https://www.instagram.com/ice.gik/)

## About the website

The site brings the programme, venue, registration, and event contacts together in one place. Visitors can explore an interactive 3D truss, read the module details, and download the event dates to their calendar. Registration is handled through Google Forms.

## Run locally

Open `index.html` directly in a browser, or run a local server with Python 3 from the repository root.

```sh
python -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). The site uses HTML, CSS, and JavaScript and requires no build step or package installation.

## Project structure

| Path | Purpose |
| --- | --- |
| `index.html` | Page content, programme, and registration links |
| `style.css`, `theme.css` | Layout, responsive styles, and typography |
| `app.js` | Programme dialogs, mobile navigation, and calendar download |
| `bridge-viewer.js` | Canvas truss model and scroll timeline |
| `intro.js`, `intro.css` | Animated ICE banner and homepage transition |
| `assets/` | Campaign illustrations, bundled fonts and licences, and the event guide |

## Bridge sequence

- **Construction speed.** In `bridge-viewer.js`, edit the `start` and `end` fractions in `bridgeTimeline`. A wider interval gives a stage more scroll distance and slows it down. Keep adjacent stages aligned. The stagger in `prepareBridgeMembers` sets how much neighboring parts overlap as they move.
- **Scroll distance.** Change `--bridge-travel` in `style.css`. It defaults to `255svh` and drops to `215svh` on screens up to 640px wide.
- **Rotation sensitivity.** The last 35% of the timeline maps linearly to one full turn. Move both `inspection.end` and `rotation.start` earlier for fewer degrees per scroll pixel, or later for more. Keep `rotation.end` at 1.

## Deployment

Serve the repository root on a static host with `index.html` as the entry point. Keep the relative paths to the stylesheets, scripts, `assets/`, and `ICE Logo Banner.jfif.jpeg` intact.

The intro plays on first visit and on reload. Use `?intro=1` to replay it on demand, or set `data-ice-intro="off"` in `index.html` to disable it. Visitors can dismiss it with **Skip Intro** or **Escape**, and the site bypasses it when their browser requests reduced motion.

## Credits

The opening animation uses the ICE GIK Student Chapter banner. Campaign images are AI-generated illustrations, including the conceptual tied-arch bridge on the homepage. Instrument Sans and Instrument Serif are bundled with their licences in [assets/fonts](assets/fonts/).
