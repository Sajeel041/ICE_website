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
theme.css — the Spatial UI treatment.
app.js — module dialogs, mobile navigation, truss animation and calendar download.
bridge-viewer.js — the interactive timber truss and its lit workshop exhibit.
assets/ — all five campaign images, the source image used to display the ICE
chapter logo, and the downloadable modules PDF.

HOMEPAGE INTRO
The intro uses the original ICE Logo Banner.jfif.jpeg over the live homepage.
Opening index.html directly from disk plays the intro. Refreshing that tab
skips it. On a web server it plays once per tab session. Append ?intro=1
to the homepage URL to replay on demand.
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

Google Fonts are loaded online, with system-font fallbacks. The registration
form, Instagram, WhatsApp and map links need an internet connection.
The website links to the Google Form; it does not store registrations itself.

IMAGERY
The five campaign visuals are AI-generated illustrative imagery, not actual
event/venue photographs. The website includes this distinction. The ICE logo
is displayed from an earlier ConstructX poster published on GIKI's website:
https://giki.edu.pk/wp-content/uploads/2025/12/construct.jpg
Only its logo region is displayed; old poster dates and fees are not used.

EXPORT
Source version: c03e59b7197a69370b7b8403bb11f01e5b0bf2ee
This is a portable export. Hosting-account metadata, Git history and
credentials are intentionally excluded.
