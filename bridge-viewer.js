"use strict";

const workshopLight = normalise([-0.56, 0.81, 0.32]);

const bridgeTimeline = {
  foundation: { start: 0, end: 0.10, label: "Foundation" },
  deck: { start: 0.10, end: 0.25, label: "Deck" },
  frame: { start: 0.25, end: 0.45, label: "Truss Assembly" },
  bracing: { start: 0.45, end: 0.55, label: "Diagonal Bracing" },
  joints: { start: 0.55, end: 0.60, label: "Joints and Connectors" },
  inspection: { start: 0.60, end: 0.65, label: "Structural Inspection" },
  rotation: { start: 0.65, end: 1, label: "360° Inspection" },
};

function clampProgress(value) {
  return Math.max(0, Math.min(1, value));
}

function stageProgress(progress, { start, end }) {
  return clampProgress((progress - start) / (end - start));
}

function initBridgeSequence() {
  const section = document.getElementById("bridge-challenge");
  const scene = section.querySelector(".bridge-scene");
  const canvas = document.getElementById("bridge-canvas");
  const status = section.querySelector(".bridge-status");
  const hint = section.querySelector(".bridge-scroll-hint");
  const phase = document.getElementById("bridge-phase");
  const percent = document.getElementById("bridge-percent");
  const bar = document.getElementById("bridge-progress");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const viewer = createBridgeViewer(canvas);
  if (!viewer) return;

  document.getElementById("bridge-preview").hidden = true;
  canvas.hidden = false;

  const stages = Object.values(bridgeTimeline);
  let frame;
  let previousProgress;

  function update() {
    frame = undefined;
    const top = Number.parseFloat(getComputedStyle(scene).top) || 0;
    const bounds = section.getBoundingClientRect();
    const distance = bounds.height - scene.getBoundingClientRect().height;
    const progress = motion.matches || distance <= 0
      ? 1
      : clampProgress((top - bounds.top) / distance);
    if (progress === previousProgress) return;
    previousProgress = progress;
    viewer.seek(progress);

    const stage = stages.find(({ end }) => progress < end);
    const label = stage?.label ?? "Inspection Complete";
    if (phase.textContent !== label) phase.textContent = label;
    const rounded = Math.round(progress * 100);
    if (bar.value !== rounded) {
      bar.value = rounded;
      percent.textContent = rounded + "%";
    }
  }

  function schedule() {
    if (frame === undefined) frame = window.requestAnimationFrame(update);
  }

  function setMotion() {
    section.classList.toggle("has-scroll-sequence", !motion.matches);
    hint.hidden = status.hidden = motion.matches;
    update();
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  motion.addEventListener("change", setMotion);
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(section);
  setMotion();
}

function createBridgeViewer(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  const defaultView = { yaw: -0.42, pitch: 0.38 };
  const view = { ...defaultView };
  const members = prepareBridgeMembers();
  let progress = 1;
  let rotation = 0;
  const benchTop = -1.16;
  const bench = beamFaces({
    start: [-8.2, benchTop - 0.13, 0],
    finish: [8.2, benchTop - 0.13, 0],
    width: 6.6,
    depth: 0.26,
    material: { color: "#7d5438", grain: 30 },
  });
  let drag;
  let nextFrame;

  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;

    const resolution = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.5 : 2);
    const pixelWidth = Math.round(width * resolution);
    const pixelHeight = Math.round(height * resolution);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(resolution, 0, 0, resolution, 0, 0);

    const scale = Math.min(width / (width < 640 ? 14 : 17.3), height / 9.4);
    const faces = members.flatMap((member) => poseBridgeMember(member, progress, rotation));
    const { yaw, pitch } = view;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const camera = [sinYaw * cosPitch, sinPitch, cosYaw * cosPitch];

    function project([x, y, z]) {
      const across = cosYaw * x - sinYaw * z;
      const forward = sinYaw * x + cosYaw * z;
      return {
        x: width / 2 + across * scale,
        y: height * 0.57 - ((y - 0.65) * cosPitch - forward * sinPitch) * scale,
        depth: y * sinPitch + forward * cosPitch,
      };
    }

    function trace(points) {
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    }

    function polygon(points) {
      context.beginPath();
      trace(points);
      context.closePath();
    }

    const background = context.createRadialGradient(
      width * 0.31, height * 0.28, 0, width * 0.31, height * 0.28, Math.max(width, height) * 0.74
    );
    background.addColorStop(0, "#534735");
    background.addColorStop(0.52, "#332d23");
    background.addColorStop(1, "#161b17");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    function renderSurfaces(surfaces) {
      const visible = surfaces.filter(({ normal }) => dot(normal, camera) > 0);
      const projected = visible.map((face) => {
        const points = face.vertices.map(project);
        const depth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
        return { ...face, points, depth };
      });
      projected.sort((first, second) => first.depth - second.depth);

      for (const face of projected) {
        polygon(face.points);
        context.globalAlpha = face.opacity ?? 1;
        context.fillStyle = face.color;
        context.fill();
        if (face.grain) drawGrain(face);
        context.strokeStyle = "#21150c40";
        context.lineWidth = 0.6;
        polygon(face.points);
        context.stroke();
      }
      context.globalAlpha = 1;
    }

    function drawGrain({ points, grain, seed }) {
      context.save();
      context.clip();
      context.lineWidth = 0.65;
      for (let index = 0; index < grain; index++) {
        const ripple = Math.sin(seed + index * 2.4) * 0.025;
        const fraction = (index + 0.65) / (grain + 0.3);
        const start = interpolatePoint(points[0], points[1], fraction);
        const finish = interpolatePoint(points[3], points[2], fraction + ripple);
        context.strokeStyle = index % 3 === 0 ? "#fff3cb35" : "#3d231832";
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.quadraticCurveTo(
          (start.x + finish.x) / 2 + ripple * 4,
          (start.y + finish.y) / 2 + ripple * 16,
          finish.x,
          finish.y
        );
        context.stroke();
      }
      context.restore();
    }

    function drawCastShadow() {
      const worktop = [
        [-8.2, benchTop, -3.3], [8.2, benchTop, -3.3],
        [8.2, benchTop, 3.3], [-8.2, benchTop, 3.3],
      ];
      context.save();
      polygon(worktop.map(project));
      context.clip();
      context.beginPath();
      for (const { shadowVertices, normal } of faces) {
        if (dot(normal, workshopLight) <= 0) continue;
        const shadow = shadowVertices.map(([x, y, z]) => {
          const distance = (y - benchTop) / workshopLight[1];
          return project([x - workshopLight[0] * distance, benchTop, z - workshopLight[2] * distance]);
        });
        trace(shadow);
        context.closePath();
      }
      context.filter = "blur(1.2px)";
      context.fillStyle = "#24171070";
      context.fill();
      context.restore();
    }

    renderSurfaces(bench);
    drawCastShadow();
    renderSurfaces(faces);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (progress !== 1 || event.pointerType !== "mouse" || !event.isPrimary || event.button !== 0) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (drag?.pointer !== event.pointerId) return;
    view.yaw += (event.clientX - drag.x) * 0.012;
    view.pitch = Math.min(0.95, Math.max(0.12, view.pitch - (event.clientY - drag.y) * 0.01));
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (nextFrame === undefined) {
      nextFrame = window.requestAnimationFrame(() => {
        nextFrame = undefined;
        draw();
      });
    }
  });

  canvas.addEventListener("lostpointercapture", () => { drag = undefined; });
  if ("ResizeObserver" in window) {
    new ResizeObserver(draw).observe(canvas);
  } else {
    window.addEventListener("resize", draw);
  }

  return {
    seek(value) {
      progress = value;
      rotation = stageProgress(progress, bridgeTimeline.rotation) * 2 * Math.PI;
      // Keep the original pose exact at both ends of the turn.
      if (value === 1) rotation = 0;
      drag = undefined;
      Object.assign(view, defaultView);
      canvas.classList.toggle("can-inspect", value === 1);
      draw();
    },
  };
}

function prepareBridgeMembers() {
  const beams = buildBridge();
  const groups = beams.reduce((groups, beam) => {
    (groups[beam.group] ??= []).push(beam);
    return groups;
  }, {});
  const poses = new Map();

  for (const [group, parts] of Object.entries(groups)) {
    const stage = bridgeTimeline[group];
    parts.sort((a, b) => (a.start[0] + a.finish[0]) - (b.start[0] + b.finish[0]));
    parts.forEach((beam, index) => {
      const stagger = parts.length > 1 ? index / (parts.length - 1) : 0;
      const start = stage.start + (stage.end - stage.start) * 0.64 * stagger;
      const end = start + (stage.end - stage.start) * 0.36;
      const pivot = beam.start.map((coordinate, axis) => (coordinate + beam.finish[axis]) / 2);
      poses.set(beam, { start, end, pivot, group, faces: beamFaces(beam) });
    });
  }
  return beams.map((beam) => poses.get(beam));
}

function poseBridgeMember(member, progress, rotation) {
  const installed = stageProgress(progress, member);
  if (installed === 0) return [];
  if (installed === 1 && rotation === 0) return member.faces;

  const { pivot, group } = member;
  const remaining = 1 - installed * installed * (3 - 2 * installed);
  const side = Math.sign(pivot[2] || 1);
  const lift = (group === "foundation" ? 0.75 : 1.55) * remaining;
  const slide = (group === "deck" ? 0.35 : 0.85) * side * remaining;
  const tilt = (group === "foundation" ? 0 : 0.23 * side) * remaining;
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const cosYaw = Math.cos(rotation);
  const sinYaw = Math.sin(rotation);
  const highlight = 0.11 * Math.sin(installed * Math.PI);

  function rotate([x, y, z]) {
    return [x * cosYaw + z * sinYaw, y, -x * sinYaw + z * cosYaw];
  }

  function place([x, y, z]) {
    const dy = y - pivot[1];
    const dz = z - pivot[2];
    return rotate([
      x,
      pivot[1] + dy * cosTilt - dz * sinTilt + lift,
      pivot[2] + dy * sinTilt + dz * cosTilt + slide,
    ]);
  }

  return member.faces.map((face) => {
    const [x, y, z] = face.normal;
    const normal = rotate([x, y * cosTilt - z * sinTilt, y * sinTilt + z * cosTilt]);
    const vertices = face.vertices.map(place);
    return {
      ...face,
      vertices,
      normal,
      shadowVertices: face.shadowVertices === face.vertices ? vertices : [...vertices].reverse(),
      color: litColor(face.material, normal, highlight),
      opacity: Math.min(1, installed * 5),
    };
  });
}

function buildBridge() {
  const beams = [];
  const deck = { color: "#e5bd89", grain: 5 };
  const timber = { color: "#c79866", grain: 4 };
  const bracing = { color: "#b77349", grain: 3 };
  const joints = { color: "#a6aa99" };
  const foundation = { color: "#929487" };

  function beam(start, finish, width, depth, material, group = "frame") {
    beams.push({ start, finish, width, depth, material, group });
  }

  const bottom = [-6, -4, -2, 0, 2, 4, 6];
  const top = [-5, -3, -1, 1, 3, 5];
  const halfWidth = 1.4;
  const height = 2.35;

  for (const z of [-halfWidth, halfWidth]) {
    beam([-6, 0, z], [6, 0, z], 0.23, 0.25, timber);
    beam([-5, height, z], [5, height, z], 0.20, 0.22, timber);
    top.forEach((x, index) => {
      beam([bottom[index], 0, z], [x, height, z], 0.17, 0.18, bracing, "bracing");
      beam([bottom[index + 1], 0, z], [x, height, z], 0.17, 0.18, bracing, "bracing");
      beam([x - 0.12, height, z], [x + 0.12, height, z], 0.26, 0.27, joints, "joints");
    });
    for (const x of bottom) {
      beam([x - 0.13, 0, z], [x + 0.13, 0, z], 0.28, 0.29, joints, "joints");
    }
  }

  for (const x of top) {
    beam([x, height, -halfWidth], [x, height, halfWidth], 0.14, 0.15, timber);
  }
  for (let index = 0; index + 1 < top.length; index++) {
    const side = index % 2 ? halfWidth : -halfWidth;
    beam([top[index], height, side], [top[index + 1], height, -side], 0.11, 0.11, timber, "bracing");
  }
  for (let index = 0; index < 31; index++) {
    const x = -6 + index * 0.4;
    beam([x, -0.14, -halfWidth], [x, -0.14, halfWidth], 0.365, 0.13, deck, "deck");
  }
  for (const x of [-5.7, 5.7]) {
    beam([x, -0.71, -1.75], [x, -0.71, 1.75], 1.05, 0.90, foundation, "foundation");
  }

  return beams;
}

function beamFaces({ start, finish, width, depth, material }) {
  const axis = difference(finish, start);
  const reference = Math.abs(axis[1]) > Math.hypot(axis[0], axis[2]) ? [1, 0, 0] : [0, 1, 0];
  const lateral = normalise(cross(axis, reference));
  const vertical = normalise(cross(lateral, axis));

  function corners(origin) {
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([side, up]) =>
      origin.map((coordinate, index) =>
        coordinate + lateral[index] * side * width / 2 + vertical[index] * up * depth / 2
      )
    );
  }

  const first = corners(start);
  const second = corners(finish);
  const sides = first.map((_, index) => {
    const next = (index + 1) % 4;
    return [first[index], first[next], second[next], second[index]];
  });
  const center = start.map((coordinate, index) => (coordinate + finish[index]) / 2);

  return [...sides, first, second].map((vertices, index) => {
    const [origin, edge, diagonal] = vertices;
    let normal = normalise(cross(difference(edge, origin), difference(diagonal, origin)));
    const outward = dot(normal, difference(origin, center)) > 0;
    if (!outward) normal = normal.map((coordinate) => -coordinate);
    return {
      vertices,
      shadowVertices: outward ? vertices : [...vertices].reverse(),
      normal,
      material,
      color: litColor(material, normal),
      grain: index < 4 ? material.grain : 0,
      seed: dot(origin, [3.7, 7.1, 5.3]),
    };
  });
}

function interpolatePoint(from, to, fraction) {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function litColor(material, normal, highlight = 0) {
  const light = 0.64 + 0.49 * Math.max(0, dot(normal, workshopLight));
  return shade(material.color, light + highlight);
}

function shade(hex, intensity) {
  const channels = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16));
  const [red, green, blue] = channels.map((value) => Math.min(255, Math.round(value * intensity)));
  return `rgb(${red}, ${green}, ${blue})`;
}

function difference(first, second) {
  return first.map((coordinate, index) => coordinate - second[index]);
}

function dot(first, second) {
  return first.reduce((sum, coordinate, index) => sum + coordinate * second[index], 0);
}

function cross([ax, ay, az], [bx, by, bz]) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function normalise(vector) {
  const length = Math.hypot(...vector);
  return vector.map((coordinate) => coordinate / length);
}
