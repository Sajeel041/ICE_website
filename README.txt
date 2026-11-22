CONSTRUCTX 4.0 — COMPLETE WEBSITE

This package contains the latest image-led website, including the ICE GIK
Student Chapter logo, Instagram/contact links, registration link, and PDF guide.

GET STARTED
1. Extract this ZIP completely.
2. Open index.html in a browser for a quick preview.
3. For local development, open this folder in VS Code and use Live Server.
   Alternatively, run: python -m http.server 8000
   Then visit http://localhost:8000

HOSTING
Upload index.html, style.css, theme.css, intro.css, app.js, intro.js,
bridge-viewer.js, ICE Logo Banner.jfif.jpeg and the assets folder to any
static web host. Keep their relative paths unchanged. No build step, Node.js,
database, or API keys are needed. The source HTML/CSS/JavaScript files are
also the deployable website files.

EDITING
index.html — page copy, navigation, registration/contact links and images.
style.css — layout, colors, fonts, and responsive/mobile design.
theme.css — the powder-blue and lavender theme, local fonts and bridge hero.
app.js — module dialogs, mobile navigation, truss animation and calendar download.
bridge-viewer.js — the interactive timber truss and its lit workshop exhibit.
assets/ — campaign images, typefaces and their licences, and the modules PDF.

HOMEPAGE INTRO
The intro uses the original ICE Logo Banner.jfif.jpeg over the live homepage.
The intro plays on the first visit and on every reload, both on a web server
and when opening index.html from disk. Append ?intro=1 to force a replay
when following a link back to the homepage in the same tab.
Skip Intro and Escape dismiss it. Reduced-motion visitors go straight to the page.
Set data-ice-intro="off" on the html element in index.html to disable it sitewide.
In intro.js, speed controls the whole sequence (1 is normal, 2 is twice as fast).
The cue times are milliseconds at normal speed. particleCount controls desktop
and mobile density. drawParticles sets the colors, trails and burst distances.
In intro.css, .intro-emblem, .intro-halo and .intro-flash set the glow and bloom.
.intro-wave and .intro-echo style the rings. runTimeline in intro.js controls
their expansion and fade, the charging glow, and the homepage entrance delays.

EXTERNAL LINKS
Registration: https://forms.gle/UC5qz2VmQDWVADrw6
Instagram: https://www.instagram.com/ice.gik/
Coordinator: Syed Huzaifa — 0317 4785695
Contact details and 25 November 2026 deadline were taken from the supplied
registration form when this version was prepared. Update them if changed.

Instrument Sans and Instrument Serif are bundled under assets/fonts. The registration
form, Instagram, WhatsApp and map links need an internet connection.
The website links to the Google Form; it does not store registrations itself.

IMAGERY
The campaign visuals are AI-generated illustrations. The bridge-blue-hour.webp
hero depicts a conceptual tied-arch bridge. The intro displays the supplied
ICE GIK Student Chapter banner.

Hero art direction (built-in ImageGen):
"Landscape architectural photograph for a civil engineering event. Sculptural
white tied-arch bridge with amber lighting at blue hour, over a river surrounded
by mountain silhouettes. Bridge concentrated on the right with a broad expanse
of clean powder blue sky and light lavender mountain mist to the left for
website typography. Polished editorial photography, realistic details. No
lettering or interface."

EXPORT
Source version: c03e59b7197a69370b7b8403bb11f01e5b0bf2ee
This is a portable export. Hosting-account metadata, Git history and
credentials are intentionally excluded.
