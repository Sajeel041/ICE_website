"use strict";

const workshopLight = normalise([-0.56, 0.81, 0.32]);

function createBridgeViewer(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  const defaultView = { yaw: -0.42, pitch: 0.38 };
  const view = { ...defaultView };
  const faces = buildBridge().flatMap(beamFaces);
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

    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * resolution);
    const pixelHeight = Math.round(height * resolution);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(resolution, 0, 0, resolution, 0, 0);

    const scale = Math.min(width / 17.3, height / 8.6);
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
        context.fillStyle = face.color;
        context.fill();
        if (face.grain) drawGrain(face);
        context.strokeStyle = "#21150c40";
        context.lineWidth = 0.6;
        polygon(face.points);
        context.stroke();
      }
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
    if (!event.isPrimary || event.button !== 0) return;
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
    draw,
    rotate(direction) {
      view.yaw += direction * Math.PI / 8;
      draw();
    },
    reset() {
      Object.assign(view, defaultView);
      draw();
    },
  };
}

function buildBridge() {
  const beams = [];
  const deck = { color: "#e5bd89", grain: 5 };
  const timber = { color: "#c79866", grain: 4 };
  const bracing = { color: "#b77349", grain: 3 };
  const joints = { color: "#a6aa99" };
  const foundation = { color: "#929487" };

  function beam(start, finish, width, depth, material) {
    beams.push({ start, finish, width, depth, material });
  }

  const bottom = [-6, -4, -2, 0, 2, 4, 6];
  const top = [-5, -3, -1, 1, 3, 5];
  const halfWidth = 1.4;
  const height = 2.35;

  for (const z of [-halfWidth, halfWidth]) {
    beam([-6, 0, z], [6, 0, z], 0.23, 0.25, timber);
    beam([-5, height, z], [5, height, z], 0.20, 0.22, timber);
    top.forEach((x, index) => {
      beam([bottom[index], 0, z], [x, height, z], 0.17, 0.18, bracing);
      beam([bottom[index + 1], 0, z], [x, height, z], 0.17, 0.18, bracing);
      beam([x - 0.12, height, z], [x + 0.12, height, z], 0.26, 0.27, joints);
    });
    for (const x of bottom) {
      beam([x - 0.13, 0, z], [x + 0.13, 0, z], 0.28, 0.29, joints);
    }
  }

  for (const x of top) {
    beam([x, height, -halfWidth], [x, height, halfWidth], 0.14, 0.15, timber);
  }
  for (let index = 0; index + 1 < top.length; index++) {
    const side = index % 2 ? halfWidth : -halfWidth;
    beam([top[index], height, side], [top[index + 1], height, -side], 0.11, 0.11, timber);
  }
  for (let index = 0; index < 31; index++) {
    const x = -6 + index * 0.4;
    beam([x, -0.14, -halfWidth], [x, -0.14, halfWidth], 0.365, 0.13, deck);
  }
  for (const x of [-5.7, 5.7]) {
    beam([x, -0.71, -1.75], [x, -0.71, 1.75], 1.05, 0.90, foundation);
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
    const light = 0.64 + 0.49 * Math.max(0, dot(normal, workshopLight));
    return {
      vertices,
      shadowVertices: outward ? vertices : [...vertices].reverse(),
      normal,
      color: shade(material.color, light),
      grain: index < 4 ? material.grain : 0,
      seed: dot(origin, [3.7, 7.1, 5.3]),
    };
  });
}

function interpolatePoint(from, to, fraction) {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
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
