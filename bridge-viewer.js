import {
  ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, PMREMGenerator, Scene, Vector3, WebGLRenderer,
} from "./vendor/three.module.min.js";
import { bridgeTimeline, clampProgress, createBridgeModel, smoothstep } from "./bridge-model.js";
import { createWorkshop, loadWorkshopTextures } from "./bridge-workshop.js";

const track = document.querySelector(".bridge-track");
const frame = track.querySelector(".bridge-scene");
const canvas = document.getElementById("bridge-canvas");
const stage = canvas.parentElement;
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

async function createViewer({ signal, getAsset, waitForTurn, viewport }) {
  await waitForTurn();
  let start = performance.now();
  const lowMemory = navigator.deviceMemory <= 4;
  const compact = lowMemory || matchMedia("(pointer: coarse), (max-width: 720px)").matches;
  const attributes = { alpha: false, antialias: !lowMemory, powerPreference: "default" };
  const context = canvas.getContext("webgl2", attributes);
  if (!context) return null;

  const renderer = new WebGLRenderer({ canvas, context, ...attributes });
  performance.measure("bridge:renderer", { start });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  let textures;
  let environment;
  const scene = new Scene();
  function dispose() {
    releaseScene(scene, textures);
    environment?.dispose();
    renderer.dispose();
  }
  try {
    start = performance.now();
    textures = await loadWorkshopTextures(Math.min(renderer.capabilities.getMaxAnisotropy(), compact ? 2 : 8), getAsset, waitForTurn);
    performance.measure("bridge:texture-prep", { start });
    await waitForTurn();
    start = performance.now();
    const workshop = createWorkshop(scene, textures, compact ? "compact" : "full");
    performance.measure("bridge:workshop-geometry", { start });
    await waitForTurn();
    start = performance.now();
    const bridge = createBridgeModel(workshop.geometryFor, workshop.materials);
    scene.add(bridge.group);
    performance.measure("bridge:bridge-geometry", { start });

    const camera = new PerspectiveCamera(37, 1, 0.25, 250);
    const focus = new Vector3();
    const budget = lowMemory ? 820_000 : compact ? 1_100_000 : 2_650_000;
    const dprLimit = lowMemory ? 1.12 : compact ? 1.32 : 1.65;
    let quality = 1;
    let slowFrames = 0, lastDraw = -Infinity;
    let installed;
    let assembled = 0;
    function resize(width, height) {
      const dpr = Math.min(devicePixelRatio || 1, dprLimit, Math.sqrt(budget / (width * height))) * quality;
      renderer.setDrawingBufferSize(width, height, dpr);
      camera.aspect = width / height;
      camera.setViewOffset(width, height, 0, height * lensOffset(camera.aspect), width, height);
    }

    await waitForTurn();
    start = performance.now();
    const pmrem = new PMREMGenerator(renderer);
    try {
      environment = pmrem.fromEquirectangular(textures.room);
    } finally {
      pmrem.dispose();
    }
    scene.background = scene.environment = environment.texture;
    textures.room.dispose();
    delete textures.room;
    performance.measure("bridge:pmrem", { start });

    await waitForTurn();
    const compilationStarted = performance.now();
    bridge.seek(1);
    renderer.compile(scene, camera);
    performance.measure("bridge:shader-submit", { start: compilationStarted });
    const maps = Object.values(textures);
    for (let index = 0; index < maps.length; index += 2) {
      await waitForTurn();
      start = performance.now();
      maps.slice(index, index + 2).forEach((texture) => renderer.initTexture(texture));
      performance.measure("bridge:texture-upload", { start });
    }
    // Three r179's compileAsync polls indefinitely and cannot be cancelled on context loss.
    // Use the same readiness check with a bounded wait and keep the lifecycle responsive.
    if (context.getExtension("KHR_parallel_shader_compile")) {
      while (performance.now() - compilationStarted < 1200 && renderer.info.programs.some((program) => !program.isReady())) {
        await new Promise((resolve) => setTimeout(resolve, 16));
        if (document.hidden) await waitForTurn();
        signal.throwIfAborted();
      }
    }
    performance.measure("bridge:shaders", { start: compilationStarted });
    await waitForTurn();
    if (!viewport.visible) {
      start = performance.now();
      renderer.setDrawingBufferSize(1, 1, 1);
      camera.aspect = frame.clientWidth / Math.max(frame.clientHeight, 1);
      camera.updateProjectionMatrix();
      positionCamera(camera, focus, 1, { yaw: 0, pitch: 0 });
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      performance.measure("bridge:warm-draw", { start });
    }
    renderer.shadowMap.needsUpdate = true;
    return {
      resize,
      draw(progress, drag, now) {
        const start = performance.now();
        const assembly = Math.min(progress, constructionEnd);
        if (assembly !== installed) {
          installed = assembly;
          const result = bridge.seek(assembly);
          assembled = result.assembled;
          workshop.seek(assembly);
          if (result.changed) renderer.shadowMap.needsUpdate = true;
        }
        positionCamera(camera, focus, progress, drag);
        renderer.render(scene, camera);
        const interval = now - lastDraw;
        lastDraw = now;
        if (quality === 1) {
          const slow = performance.now() - start > 25 || (interval > 27 && interval < 120);
          slowFrames = slow ? slowFrames + 1 : Math.max(0, slowFrames - 1);
          if (slowFrames >= 9) {
            quality = 0.82;
            performance.mark("bridge:quality-reduced");
            return { assembled, refresh: true };
          }
        }
        return { assembled, refresh: false };
      },
      memberCount: bridge.memberCount,
      dispose,
    };
  } catch (error) {
    dispose();
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

export async function startBridge({ viewport, lifecycle, waitForTurn, getAsset }) {
  const { signal } = lifecycle;
  const options = { signal };
  const init = performance.now();
  let viewer;
  let resize;
  let raf = 0;
  let shown;
  let painted;
  let lastTick = 0;
  let dirty = true;
  let layout;
  let firstFrame = false;
  let drag;
  let assembled = 0;
  let optIn = false;
  let debug;
  const angle = { yaw: 0, pitch: 0 };

  function stop(message) {
    lifecycle.abort();
    track.classList.remove("has-scroll-sequence");
    canvas.hidden = status.hidden = motionToggle.hidden = true;
    stage.classList.remove("is-live");
    preview.removeAttribute("aria-hidden");
    hint.textContent = message;
    hint.hidden = false;
  }

  canvas.addEventListener("webglcontextlost", () => {
    stop("The 3D workshop was interrupted. Reload to try again.");
  }, options);
  signal.addEventListener("abort", () => {
    resize?.disconnect();
    cancelAnimationFrame(raf);
    viewer?.dispose();
    viewer = undefined;
    debug?.remove();
  }, { once: true });

  let failure = "This browser does not have WebGL 2 available.";
  try {
    viewer = await createViewer({ signal, getAsset, waitForTurn, viewport });
  } catch (error) {
    if (signal.aborted) return;
    console.warn("The bridge workshop could not start.", error);
    failure = "The workshop could not load. Reload to try again.";
  }
  if (signal.aborted) {
    viewer?.dispose();
    return;
  }
  if (!viewer) {
    stop(failure);
    return;
  }
  performance.mark("bridge:scene-ready");
  performance.measure("bridge:scene-init", { start: init, end: "bridge:scene-ready" });
  debug = createDebugOverlay();

  function schedule() {
    if (!raf && viewport.visible && !document.hidden) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = 0;
    if (!viewport.visible || document.hidden) return;
    if (dirty) {
      const panel = frame.getBoundingClientRect();
      const bounds = track.getBoundingClientRect();
      if (!panel.width || !panel.height) return;
      layout = { top: bounds.top + scrollY, travel: bounds.height - panel.height };
      viewer.resize(panel.width, panel.height);
    }
    const { top, travel } = layout;
    const scrolled = scrollY - top;
    // Fractional viewport units can place the end between two scroll pixels.
    const active = track.classList.contains("has-scroll-sequence");
    const target = !active ? 1 : travel <= 0 ? 0 : scrolled >= travel - 1 ? 1 : clampProgress(scrolled / travel);
    const delta = target - shown;
    const jump = shown === undefined || target === 0 || target === 1 || Math.abs(delta) > 0.12;
    const elapsed = Math.min(40, Math.max(14, now - lastTick));
    shown = jump || Math.abs(delta) < 0.00016 ? target : shown + delta * (1 - Math.exp(-elapsed / 48));
    lastTick = now;

    if (shown !== 1) {
      drag = undefined;
      angle.yaw = angle.pitch = 0;
    }
    if (dirty || shown !== painted) {
      const draw = viewer.draw(shown, angle, now);
      assembled = draw.assembled;
      painted = shown;
      dirty = false;
      if (draw.refresh) {
        updateSize();
      }
      if (!firstFrame) {
        canvas.hidden = false;
        stage.classList.add("is-live");
        preview.setAttribute("aria-hidden", "true");
        firstFrame = true;
        requestAnimationFrame(() => {
          if (signal.aborted) return;
          performance.mark("bridge:first-frame");
          performance.measure("bridge:enter-to-first-frame", "bridge:entered", "bridge:first-frame");
        });
      }
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
      pinned: active && travel > 0 && scrolled >= 0 && scrolled < travel,
      active, travel,
    });
    if (shown !== target) schedule();
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
    updateSize();
  }

  function updateVisibility() {
    if (viewport.visible && !document.hidden) {
      shown = undefined;
      updateSize();
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      drag = undefined;
    }
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
  window.addEventListener("pageshow", updateVisibility, options);
  viewport.addEventListener("change", updateVisibility, options);
  document.addEventListener("visibilitychange", updateVisibility, options);
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
    resize.observe(track);
    resize.observe(document.querySelector("main"));
  }
  updateMotion();
}
