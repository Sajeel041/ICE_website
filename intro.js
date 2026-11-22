(() => {
  "use strict";

  const root = document.documentElement;
  if (root.dataset.iceIntro !== "on" || !window.matchMedia || !Element.prototype.animate ||
      !window.requestAnimationFrame || !window.CSS?.supports("clip-path", "inset(1px round 1px)")) return;

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches || !motion.addEventListener || !("inert" in HTMLElement.prototype)) return;
  const replay = new URLSearchParams(location.search).get("intro") === "1";
  const sessionKey = "ice-gik.intro.seen";
  const navigationType = performance.getEntriesByType("navigation")[0]?.type;
  const localOpen = location.protocol === "file:" && navigationType === "navigate";
  if (!replay && !localOpen && navigationType !== "reload") {
    if (history.state?.[sessionKey]) return;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch { /* The intro can play without storage access. */ }
  }

  function rememberVisit() {
    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // Some browsers restrict sessionStorage for files. History state survives a refresh.
      try { history.replaceState({ ...history.state, [sessionKey]: true }, ""); } catch { /* Storage is optional. */ }
    }
  }

  // Cue times are in milliseconds. Change speed to retime the entire sequence.
  const speed = 1;
  const cue = { attract: 600, form: 1400, hold: 2800, charge: 3200, burst: 3800,
    entrance: 4140, clear: 4500, end: 5050 };
  const particleCount = { compact: 56, wide: 148 };
  const logo = new Image();
  logo.alt = "";
  logo.fetchPriority = "high";
  logo.width = 2064;
  logo.height = 512;
  const animations = [];
  const inertElements = [];
  let overlay, skip, frame, stopped = false;
  let guard;

  function uncover() {
    const hadFocus = skip && document.activeElement === skip && skip.matches(":focus-visible");
    root.classList.remove("ice-intro-active", "ice-intro-revealing");
    inertElements.splice(0).forEach(el => { el.inert = false; });
    (overlay || document.getElementById("ice-intro"))?.remove();
    if (hadFocus) document.querySelector(".skip-link")?.focus({ preventScroll: true });
  }

  function finish() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(guard);
    animations.forEach(animation => animation.cancel());
    uncover();
    logo.onerror = null;
    document.removeEventListener("DOMContentLoaded", start);
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pagehide", finish);
    motion.removeEventListener("change", finish);
  }

  function dismiss() {
    rememberVisit();
    finish();
  }
  function onClick(event) { if (event.target.closest?.(".intro-skip")) dismiss(); }
  function onKey(event) { if (event.key === "Escape") dismiss(); }
  motion.addEventListener("change", finish);
  window.addEventListener("pagehide", finish);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  document.addEventListener("DOMContentLoaded", start, { once: true });
  logo.onerror = finish;
  logo.src = "ICE Logo Banner.jfif.jpeg";
  root.classList.add("ice-intro-active");

  let canvas, ctx, width, height, particles, origin;

  function resize() {
    width = overlay.clientWidth;
    height = overlay.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, width * dpr / 2, height * dpr / 2);
    const count = width < 760 ? particleCount.compact : particleCount.wide;
    particles = Array.from({ length: count }, () => ({
      x: (Math.random() - .5) * width,
      y: (Math.random() - .5) * height,
      delay: Math.random() * .29,
      radius: .5 + Math.random() * 1.25,
      brightness: .34 + Math.random() * .66,
      angle: Math.random() * Math.PI * 2,
      reach: .2 + Math.random() * .5,
    }));
  }

  const clamp = value => Math.min(1, Math.max(0, value));
  function drawParticles(time) {
    ctx.clearRect(-width / 2, -height / 2, width, height);
    if (time >= cue.form && time < cue.burst) return;
    const exploding = time >= cue.burst;
    const progress = exploding ? clamp((time - cue.burst) / (cue.clear - cue.burst))
      : clamp((time - cue.attract) / (cue.form - cue.attract));
    const distance = Math.hypot(width, height);
    for (const [i, p] of particles.entries()) {
      if ((exploding && i % 2) || (time < cue.attract && i % 11)) continue;
      let x, y, trail, opacity;
      if (exploding) {
        const travel = (1 - (1 - progress) ** 2) * distance * p.reach;
        x = Math.cos(p.angle) * travel;
        y = Math.sin(p.angle) * travel;
        trail = .11 * (1 - progress);
        opacity = (1 - progress) ** 1.4;
      } else {
        const t = clamp((progress - p.delay) / (1 - p.delay));
        const radius = 1 - t ** 2.5;
        x = p.x * radius;
        y = p.y * radius;
        trail = -t * .3;
        opacity = (i % 11 ? clamp((progress - p.delay) * 8) : .42) * (1 - t ** 6);
      }
      ctx.globalAlpha = opacity * p.brightness;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x * (1 - trail), y * (1 - trail));
      ctx.strokeStyle = "#22c7f2";
      ctx.lineWidth = p.radius * .85;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = i % 4 ? "#56dfff" : "#c6faff";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // All compositor tracks and the particle field use the same document timeline origin.
  function track(el, startTime, endTime, frames, easing = "linear", fill = "forwards") {
    const animation = el.animate(frames, {
      delay: startTime / speed, duration: (endTime - startTime) / speed, easing, fill,
    });
    animation.startTime = origin;
    animations.push(animation);
  }

  function runTimeline() {
    const find = selector => overlay.querySelector(selector);
    const emblem = find(".intro-emblem");
    track(find(".intro-halo"), 0, cue.burst, [
      { opacity: 0 }, { opacity: .18, offset: .25 }, { opacity: .85, offset: .67 },
      { opacity: .55, offset: .82 }, { opacity: 1 },
    ]);
    track(emblem, 0, cue.form, [
      { transform: "scale(.85)" }, { transform: "scale(1.08)", offset: .28 },
      { transform: "scale(.94)", offset: .48 }, { transform: "scale(1.16)" },
    ]);
    track(emblem, cue.form, cue.hold, [{ transform: "scale(1.16)" }, { transform: "scale(1)" }]);
    track(find(".intro-aperture"), cue.form, cue.hold, [
      { clipPath: "inset(calc(50% - 6px) calc(50% - 6px) round 6px)" },
      { clipPath: "inset(38% 44% round 4vmin)", offset: .2 },
      { clipPath: "inset(12% 16% round 2vmin)", offset: .52 },
      { clipPath: "inset(0% 0% round 0px)" },
    ], "cubic-bezier(.32,.06,.19,1)");
    track(logo, cue.form, cue.hold, [
      { opacity: 0, filter: "blur(7px)", transform: "scale(1.09)" },
      { opacity: .82, offset: .53 }, { opacity: 1, filter: "blur(0px)", transform: "scale(1)" },
    ]);
    track(find(".intro-scan"), cue.form, cue.hold, [
      { opacity: 0 }, { opacity: .26, offset: .34 }, { opacity: .1, offset: .55 },
      { opacity: .22, offset: .58 }, { opacity: 0 },
    ]);
    track(find(".intro-sweep"), cue.form + 190, cue.hold, [
      { transform: "translateX(-80%)", opacity: 0 }, { opacity: .75, offset: .4 },
      { transform: "translateX(85%)", opacity: 0 },
    ]);
    const glow = (size, color) => `drop-shadow(0 0 2px #50e8ff) drop-shadow(0 0 ${size}px ${color})`;
    track(emblem, cue.hold, cue.burst, [
      { filter: glow(10, "#00c9ed55") }, { filter: glow(9, "#00c9ed44"), offset: .4 },
      { filter: glow(28, "#00c9edbb") },
    ]);
    const jitter = Array.from({ length: 27 }, (_, i) => {
      const strength = (i / 26) ** 1.7;
      const x = Math.sin(i * 2.4) * 2.9 * strength;
      const y = Math.cos(i * 2.7) * 1.65 * strength;
      return { transform: `translate(${x}px, ${y}px) rotate(${x * .12}deg) scale(${1 + .012 * strength})` };
    });
    track(emblem, cue.charge, cue.burst, jitter);
    track(emblem, cue.burst, cue.burst + 400, [
      { transform: jitter[jitter.length - 1].transform, opacity: 1 }, { transform: "scale(1.9)", opacity: 0 },
    ], "cubic-bezier(.16,.74,.33,1)");
    track(find(".intro-flash"), cue.burst, cue.clear, [
      { opacity: 0 }, { opacity: .85, offset: .12 }, { opacity: 0 },
    ]);
    overlay.querySelectorAll(".intro-wave").forEach((wave, i) => {
      track(wave, cue.burst + i * 95, cue.clear, [
        { transform: "scale(.035)", opacity: 0 }, { opacity: .9, offset: .08 },
        { transform: "scale(1.56)", opacity: 0 },
      ], "cubic-bezier(.14,.45,.43,1)");
    });
    track(overlay, cue.entrance, cue.clear, [{ opacity: 1 }, { opacity: 0 }]);
    const entrance = [
      [".site-header", 0, -16], [".presented, #hero-title", 140, 18],
      [".hero-tagline, .hero-description, .hero-event", 245, 18],
      [".hero-actions .button", 330, 16], [".hero-actions .text-link, .deadline", 385, 16],
      [".hero-visual", 450, 24],
    ];
    for (const [selector, delay, y] of entrance) {
      document.querySelectorAll(selector).forEach(el => track(el,
        cue.entrance + delay, cue.entrance + delay + 450,
        [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "translateY(0)" }],
        "cubic-bezier(.18,.78,.24,1)", "backwards"));
    }
  }

  function tick(now) {
    const time = (now - origin) * speed;
    if (time >= cue.end || (time >= cue.form && !(logo.complete && logo.naturalWidth))) {
      finish();
      return;
    }
    if (overlay.isConnected) {
      if (time >= cue.clear) uncover();
      else {
        if (time >= cue.entrance) root.classList.add("ice-intro-revealing");
        drawParticles(time);
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function start() {
    overlay = document.getElementById("ice-intro");
    if (!overlay) return finish();
    skip = overlay.querySelector(".intro-skip");
    canvas = overlay.querySelector("canvas");
    try { ctx = canvas.getContext("2d"); } catch { return finish(); }
    if (!ctx || getComputedStyle(overlay).display !== "grid") return finish();
    overlay.hidden = false;
    overlay.querySelector(".intro-aperture").prepend(logo);
    for (const el of document.body.children) {
      if (el === overlay || el.inert) continue;
      el.inert = true;
      inertElements.push(el);
    }
    window.addEventListener("resize", resize);
    resize();
    frame = requestAnimationFrame(now => {
      origin = now;
      guard = setTimeout(finish, cue.end / speed + 800);
      try { runTimeline(); } catch { return finish(); }
      rememberVisit();
      tick(now);
    });
  }
})();
