"use strict";

const modules = {
  workshop: {
    tag: "Workshop",
    title: "Technical Workshop",
    intro: "Meet civil engineers who take projects from the drawing board to the site.",
    subtitle: "Inside the session",
    detail: "Bring a question from class. The workshop is a chance to ask practising engineers how they approach design, construction and project management.",
    note: "Speakers, topics and session timings are awaiting announcement.",
  },
  egg: {
    tag: "Egg-drop challenge",
    title: "Drop the Egg",
    intro: "Build a structure that absorbs impact and lets an egg survive a fall.",
    subtitle: "The challenge",
    detail: "Use the supplied materials to protect an egg inside a frame. The test comes when the frame is dropped and the egg is checked for cracks.",
    note: "Team size, materials, drop height and scoring details will be shared with registered participants before the event.",
  },
};

const dialog = document.getElementById("module-dialog");
let moduleTrigger;

document.querySelectorAll("[data-module]").forEach((button) => {
  button.addEventListener("click", () => {
    const content = modules[button.dataset.module];
    for (const [key, value] of Object.entries(content)) {
      document.getElementById("dialog-" + key).textContent = value;
    }

    moduleTrigger = button;
    dialog.showModal();
    dialog.scrollTop = 0;
  });
});

dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => moduleTrigger?.focus({ preventScroll: true }));
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) {
    dialog.close();
  }
});

const bridgeTrack = document.querySelector(".bridge-track");
if (bridgeTrack) {
  const bridgeHint = bridgeTrack.querySelector(".bridge-scroll-hint");
  const bridgePreview = document.getElementById("bridge-preview");
  // Reserve the scroll range before loading the renderer or textures.
  bridgeTrack.classList.toggle("has-scroll-sequence", !matchMedia("(prefers-reduced-motion: reduce)").matches);
  bridgePreview.hidden = true;
  bridgeHint.hidden = false;
  bridgeHint.textContent = "Loading the workshop…";

  const showBridgeFallback = () => {
    bridgeTrack.classList.remove("has-scroll-sequence");
    bridgePreview.hidden = false;
    bridgeHint.textContent = "The workshop could not load. Reload to try again.";
  };
  const loadBridge = () => {
    if (location.protocol === "file:") {
      const script = document.createElement("script");
      script.src = "./vendor/bridge-local.js";
      script.addEventListener("error", showBridgeFallback, { once: true });
      document.head.append(script);
    } else {
      import("./bridge-viewer.js").then(({ startBridge }) => startBridge()).catch((error) => {
        console.warn("The bridge workshop could not load.", error);
        showBridgeFallback();
      });
    }
  };
  if ("IntersectionObserver" in window) {
    const bridgeObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      bridgeObserver.disconnect();
      loadBridge();
    }, { rootMargin: "700px 0px" });
    bridgeObserver.observe(bridgeTrack);
  } else {
    loadBridge();
  }
}

const mobileMenu = document.querySelector(".mobile-nav");
mobileMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => { mobileMenu.open = false; });
});
mobileMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector("summary").focus();
  }
});

const drawing = document.querySelector(".truss-drawing");
if ("IntersectionObserver" in window) {
  const drawingObserver = new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    drawing.classList.add("is-drawing");
    observer.disconnect();
  }, { threshold: 0.25 });
  drawing.classList.add("is-ready");
  drawingObserver.observe(drawing);

  const sectionObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("section-arrived");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12 });
  document.querySelectorAll(".modules-heading, .module-card, .about-copy, .social-visual, .guide-row")
    .forEach(element => sectionObserver.observe(element));
}

let toastTimer;
document.getElementById("calendar").addEventListener("click", () => {
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ConstructX//Event Guide//EN",
    "BEGIN:VEVENT",
    "UID:constructx4-20261204@giki-event",
    "DTSTAMP:20261117T000000Z",
    "DTSTART;VALUE=DATE:20261204",
    "DTEND;VALUE=DATE:20261207",
    "SUMMARY:ConstructX 4.0 — ICE GIKI",
    "LOCATION:GIK Institute\\, Topi\\, Swabi\\, Pakistan",
    "DESCRIPTION:All-Pakistan civil engineering event. Technical Workshop\\,",
    "  Load the Bridge\\, Drop the Egg\\, Theme Dinner and Concert. Session times",
    "  to be announced.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ConstructX-4.0.ics";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  const toast = document.getElementById("toast");
  toast.textContent = "Calendar file ready. Open it to save the dates.";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.textContent = ""; }, 4500);
});
