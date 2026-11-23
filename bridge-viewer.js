import {
  ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from "./vendor/three.module.min.js";
import { bridgeTimeline, clampProgress, createBridgeModel, smoothstep } from "./bridge-model.js";
import { createWorkshop, loadWorkshopTextures } from "./bridge-workshop.js";

const track = document.querySelector(".bridge-track");
const frame = track.querySelector(".bridge-scene");
const canvas = document.getElementById("bridge-canvas");
const preview = document.getElementById("bridge-preview");
const hint = document.querySelector(".bridge-scroll-hint");
const motionToggle = document.querySelector(".bridge-motion-toggle");
const status = document.querySelector(".bridge-status");
const bar = document.getElementById("bridge-progress");
const phase = document.getElementById("bridge-phase");
const percent = document.getElementById("bridge-percent");
const motion = matchMedia("(prefers-reduced-motion: reduce)");

const constructionEnd = bridgeTimeline[4].end;
const orbitStart = bridgeTimeline[5].end;
const orbitFraction = (progress) => smoothstep((progress - orbitStart) / (1 - orbitStart));
const shots = [
  // Progress, heading, elevation, focus X/Y/Z, horizontal framing radius.
  [0, -0.70, 0.41, -2.5, -0.63, 0.12, 5.25],
  [bridgeTimeline[0].end, -0.52, 0.42, -0.35, -0.38, -0.25, 7.85],
  [bridgeTimeline[1].end, -0.39, 0.41, 0.25, -0.13, 0.02, 8.05],
  [bridgeTimeline[2].end, -0.29, 0.35, 0.0, 0.48, 0.28, 8.24],
  [bridgeTimeline[3].end, -0.50, 0.52, 0, 0.55, -0.32, 8.47],
  [constructionEnd, -0.56, 0.46, 0, 0.57, -0.08, 8.64],
  [orbitStart, -0.53, 0.43, 0, 0.65, 0, 8.9],
];

function lensOffset(aspect) {
  return 0.026 - 0.072 * smoothstep((aspect - 0.64) / 0.32);
}

function distanceToFit(camera, focus, yaw, pitch) {
  const tangent = Math.tan(camera.fov * Math.PI / 360);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  const shift = 2 * lensOffset(camera.aspect);
  let distance = 0;
  // Bound the jigs, deck and upper chords separately to leave room around the span.
  for (const [halfX, y0, y1, halfZ] of [[6.24, -1.16, -0.17, 1.76], [6.28, -0.17, 0.18, 1.63], [5.26, 2.18, 2.56, 1.65]]) {
    for (const x of [-halfX, halfX]) {
      for (const y of [y0, y1]) {
        for (const z of [-halfZ, halfZ]) {
          const dx = x - focus.x;
          const dy = y - focus.y;
          const dz = z - focus.z;
          const along = dx * sinYaw + dz * cosYaw;
          const across = dx * cosYaw - dz * sinYaw;
          const up = dy * cosPitch - along * sinPitch;
          const near = along * cosPitch + dy * sinPitch;
          distance = Math.max(
            distance,
            near + Math.abs(across) / (0.93 * tangent * camera.aspect),
            near + Math.abs(up) / ((0.88 - Math.sign(up) * shift) * tangent),
          );
        }
      }
    }
  }
  return distance;
}

function positionCamera(camera, focus, progress, drag) {
  const index = shots.findIndex(([end]) => progress < end);
  let shot = shots.at(-1);
  if (index > 0) {
    const previous = shots[index - 1];
    const next = shots[index];
    const amount = smoothstep((progress - previous[0]) / (next[0] - previous[0]));
    shot = previous.map((value, i) => value + (next[i] - value) * amount);
  }
  const [, heading, elevation, x, y, z, width] = shot;
  const turn = progress === 1 ? 0 : orbitFraction(progress);
  const yaw = heading + turn * Math.PI * 2 + drag.yaw;
  const endOn = Math.sin(yaw) ** 2;
  const pitch = elevation + drag.pitch - 0.045 * endOn;
  const portraitFraming = 0.84 + 0.16 * smoothstep((camera.aspect - 0.55) / 0.5);
  focus.set(x, y - 0.2 * endOn, z);
  const planned = width * portraitFraming / (Math.min(camera.aspect, 1.8) * Math.tan(camera.fov * Math.PI / 360));
  const fitted = distanceToFit(camera, focus, yaw, pitch);
  const blend = Math.max(0, 1 - Math.abs(planned - fitted) / 0.55);
  const correction = Math.max(0, fitted - planned) + 0.1375 * blend * blend;
  const distance = planned + correction * smoothstep((progress - 0.02) / (bridgeTimeline[0].end * 0.64));
  const horizontal = distance * Math.cos(pitch);
  camera.position.set(x + horizontal * Math.sin(yaw), focus.y + distance * Math.sin(pitch), z + horizontal * Math.cos(yaw));
  camera.lookAt(focus);
}

function releaseScene(scene, textures) {
  const resources = new Set(Object.values(textures ?? {}));
  scene.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    if (object.shadow) object.shadow.dispose();
    if (object.geometry) resources.add(object.geometry);
    if (!object.material) return;
    for (const material of [object.material].flat()) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) resources.add(value);
      }
    }
  });
  resources.forEach((resource) => resource?.dispose());
  scene.clear();
}

async function createViewer(signal, resolveAsset) {
  const lowMemory = navigator.deviceMemory <= 4;
  const compact = lowMemory || matchMedia("(pointer: coarse), (max-width: 720px)").matches;
  const attributes = { alpha: false, antialias: !lowMemory, powerPreference: "default" };
  const context = canvas.getContext("webgl2", attributes);
  if (!context) return null;

  const renderer = new WebGLRenderer({ canvas, context, ...attributes });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  let textures;
  const scene = new Scene();
  try {
    textures = await loadWorkshopTextures(Math.min(renderer.capabilities.getMaxAnisotropy(), compact ? 2 : 8), resolveAsset);
    if (signal.aborted) {
      Object.values(textures).forEach((texture) => texture.dispose());
      renderer.dispose();
      return null;
    }
    const workshop = createWorkshop(scene, textures, compact ? "compact" : "full");
    const bridge = createBridgeModel(workshop.geometryFor, workshop.materials);
    scene.add(bridge.group);

    const camera = new PerspectiveCamera(37, 1, 0.25, 250);
    const focus = new Vector3();
    let installed;
    let assembled = 0;
    return {
      resize(width, height) {
        const budget = compact ? 1_100_000 : 2_650_000;
        const dpr = Math.min(devicePixelRatio || 1, compact ? 1.32 : 1.65, Math.sqrt(budget / (width * height)));
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.setViewOffset(width, height, 0, height * lensOffset(camera.aspect), width, height);
      },
      draw(progress, drag) {
        const assembly = Math.min(progress, constructionEnd);
        if (assembly !== installed) {
          installed = assembly;
          assembled = bridge.seek(assembly);
          workshop.seek(assembly);
          renderer.shadowMap.needsUpdate = true;
        }
        positionCamera(camera, focus, progress, drag);
        renderer.render(scene, camera);
        return assembled;
      },
      memberCount: bridge.memberCount,
      dispose() {
        releaseScene(scene, textures);
        renderer.dispose();
      },
    };
  } catch (error) {
    releaseScene(scene, textures);
    renderer.dispose();
    throw error;
  }
}

function createDebugOverlay() {
  const local = location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!local || new URLSearchParams(location.search).get("bridgeDebug") !== "1") return null;

  const overlay = document.createElement("div");
  overlay.className = "bridge-debug";
  overlay.setAttribute("aria-hidden", "true");
  frame.append(overlay);
  const markers = ["start", "end"].map((edge) => {
    const marker = document.createElement("div");
    marker.className = "bridge-debug-marker bridge-debug-" + edge;
    marker.textContent = "Pin " + edge;
    marker.setAttribute("aria-hidden", "true");
    track.append(marker);
    return marker;
  });
  return {
    update({ progress, target, label, assembled, total, pinned, active, travel }) {
      const rotation = (orbitFraction(progress) * 360).toFixed(2);
      Object.assign(overlay.dataset, { progress, target, stage: label, assembled, total, pinned, rotation });
      overlay.textContent = Math.round(progress * 100) + "% · " + label + " · " + assembled + "/" + total
        + " assembled · " + (pinned ? "Pinned" : "Unpinned");
      markers.forEach((marker) => { marker.hidden = !active || travel <= 0; });
    },
    remove() {
      overlay.remove();
      markers.forEach((marker) => marker.remove());
    },
  };
}

export async function startBridge(resolveAsset = (name) => new URL("./assets/bridge-workshop/" + name, document.baseURI).href) {
  const lifecycle = new AbortController();
  const options = { signal: lifecycle.signal };
  let viewer;
  let resize;
  let raf = 0;
  let shown;
  let painted;
  let lastTick = 0;
  let dirty = true;
  let drag;
  let assembled = 0;
  let optIn = false;
  let debug;
  const angle = { yaw: 0, pitch: 0 };

  function stop(message) {
    lifecycle.abort();
    resize?.disconnect();
    cancelAnimationFrame(raf);
    viewer?.dispose();
    debug?.remove();
    track.classList.remove("has-scroll-sequence");
    canvas.hidden = status.hidden = motionToggle.hidden = true;
    preview.hidden = false;
    if (message) hint.textContent = message;
    hint.hidden = !message;
  }

  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) stop();
  }, options);
  canvas.addEventListener("webglcontextlost", () => {
    stop("The 3D workshop was interrupted. Reload to try again.");
  }, options);

  let failure = "This browser does not have WebGL 2 available.";
  try {
    viewer = await createViewer(lifecycle.signal, resolveAsset);
  } catch (error) {
    console.warn("The bridge workshop could not start.", error);
    failure = "The workshop could not load. Reload to try again.";
  }
  if (lifecycle.signal.aborted) return;
  if (!viewer) {
    stop(failure);
    return;
  }
  debug = createDebugOverlay();

  function schedule() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = 0;
    const panel = frame.getBoundingClientRect();
    const bounds = track.getBoundingClientRect();
    const travel = bounds.height - panel.height;
    const scrolled = -bounds.top;
    // Fractional viewport units can place the end between two scroll pixels.
    const active = track.classList.contains("has-scroll-sequence");
    const target = !active ? 1 : travel <= 0 ? 0 : scrolled >= travel - 1 ? 1 : clampProgress(scrolled / travel);
    const visible = panel.bottom > 0 && panel.top < innerHeight && panel.width > 0 && panel.height > 0;
    const delta = target - shown;
    const jump = shown === undefined || !visible || target === 0 || target === 1 || Math.abs(delta) > 0.12;
    const elapsed = Math.min(40, Math.max(14, now - lastTick));
    shown = jump || Math.abs(delta) < 0.00016 ? target : shown + delta * (1 - Math.exp(-elapsed / 48));
    lastTick = now;

    if (shown !== 1) {
      drag = undefined;
      angle.yaw = angle.pitch = 0;
    }
    if (visible && (dirty || shown !== painted)) {
      if (dirty) viewer.resize(panel.width, panel.height);
      assembled = viewer.draw(shown, angle);
      painted = shown;
      dirty = false;
      canvas.hidden = false;
      preview.hidden = true;
    }
    canvas.classList.toggle("can-inspect", shown === 1);
    const label = bridgeTimeline.find(({ end }) => shown < end)?.label ?? "Inspection complete";
    if (phase.textContent !== label) phase.textContent = label;
    const progress = shown === 1 ? 100 : Math.min(99, Math.round(shown * 100));
    if (bar.value !== progress) {
      bar.value = progress;
      percent.textContent = progress + "%";
    }
    debug?.update({
      progress: shown, target, label, assembled, total: viewer.memberCount,
      pinned: active && travel > 0 && scrolled >= 0 && scrolled < travel && Math.abs(panel.top) < 1,
      active, travel,
    });
    if (visible && shown !== target) schedule();
  }

  function updateSize() {
    dirty = true;
    schedule();
  }

  function updateMotion() {
    const active = !motion.matches || optIn;
    track.classList.toggle("has-scroll-sequence", active);
    hint.textContent = "Scroll to assemble and inspect the span.";
    hint.hidden = status.hidden = !active;
    motionToggle.hidden = !motion.matches;
    motionToggle.textContent = optIn ? "Stop scroll animation" : "Play scroll animation";
    shown = undefined;
    schedule();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (shown !== 1 || event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }, options);
  canvas.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    angle.yaw -= (event.clientX - drag.x) * 0.009;
    angle.pitch = Math.min(0.30, Math.max(-0.19, angle.pitch + (event.clientY - drag.y) * 0.007));
    drag.x = event.clientX;
    drag.y = event.clientY;
    painted = undefined;
    schedule();
  }, options);
  canvas.addEventListener("lostpointercapture", () => { drag = undefined; }, options);

  window.addEventListener("scroll", schedule, { ...options, passive: true });
  window.addEventListener("resize", updateSize, options);
  motion.addEventListener("change", () => {
    optIn = false;
    updateMotion();
  }, options);
  motionToggle.addEventListener("click", () => {
    optIn = !optIn;
    updateMotion();
    track.scrollIntoView({ behavior: "instant" });
  }, options);
  if ("ResizeObserver" in window) {
    resize = new ResizeObserver(updateSize);
    resize.observe(frame);
  }
  updateMotion();
}
