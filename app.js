"use strict";

const modules = {
  workshop: {
    tag: "Workshop",
    title: "Technical Workshop",
    intro: "Connect what you study in class with how real projects are designed, built and managed.",
    subtitle: "Inside the session",
    detail: "Experienced civil engineering professionals share practical skills and current industry practice. Ask questions, join the discussion and connect with professionals and fellow students.",
    note: "Speakers, topics and session timings are awaiting announcement.",
  },
  bridge: {
    tag: "Bridge challenge",
    title: "Load the Bridge",
    intro: "Design and build a bridge from the materials provided, then see how much load it can carry.",
    subtitle: "The challenge",
    detail: "Teams plan and construct their own bridge models. Smart use of materials, strong joints and careful construction make the difference. Every bridge is loaded in a live test and its performance is measured.",
    note: "Team size, materials, dimensions and scoring details will be shared with registered participants before the event.",
  },
  egg: {
    tag: "Egg-drop challenge",
    title: "Drop the Egg",
    intro: "Build a structure that absorbs impact and lets an egg survive a fall.",
    subtitle: "The challenge",
    detail: "Teams design a protective structure from the materials provided. The structure is dropped from a height, and the egg inside has to survive.",
    note: "Team size, materials, drop height and scoring details will be shared with registered participants before the event.",
  },
};

const dialog = document.getElementById("module-dialog");
const bridgeDemo = document.getElementById("bridge-demo");
const bridgeToggle = document.getElementById("bridge-toggle");
const bridgeInteractive = document.getElementById("bridge-interactive");
const bridgePreview = document.getElementById("bridge-preview");
const bridgeError = document.getElementById("bridge-error");
let bridgeViewer;
let moduleTrigger;

function setBridgeExpanded(expanded) {
  bridgeToggle.setAttribute("aria-expanded", String(expanded));
  bridgeToggle.textContent = expanded ? "Show image" : "Explore in 3D";
  bridgeInteractive.hidden = !expanded;
  bridgePreview.hidden = expanded;
}

document.querySelectorAll("[data-module]").forEach((button) => {
  button.addEventListener("click", () => {
    const content = modules[button.dataset.module];
    for (const [key, value] of Object.entries(content)) {
      document.getElementById("dialog-" + key).textContent = value;
    }

    moduleTrigger = button;
    bridgeDemo.hidden = button.dataset.module !== "bridge";
    bridgeError.hidden = true;
    setBridgeExpanded(false);
    dialog.showModal();
    dialog.scrollTop = 0;
    if (button.hasAttribute("data-show-model")) openBridgeViewer();
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

function openBridgeViewer() {
  bridgeViewer ??= createBridgeViewer(document.getElementById("bridge-canvas"));
  if (!bridgeViewer) {
    bridgeError.hidden = false;
    return;
  }

  setBridgeExpanded(true);
  bridgeViewer.reset();
}

bridgeToggle.addEventListener("click", () => {
  if (bridgeInteractive.hidden) openBridgeViewer();
  else setBridgeExpanded(false);
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === "reset") bridgeViewer.reset();
    else bridgeViewer.rotate(button.dataset.view === "left" ? -1 : 1);
  });
});

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
