"use strict";

function createBridgeViewer(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  const defaultView = { yaw: -0.38, pitch: 0.34 };
  const view = { ...defaultView };
  const faces = buildBridge().flatMap(beamFaces);
  let drag;

  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;

    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * resolution);
    const pixelHeight = Math.round(height * resolution);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.setTransform(resolution, 0, 0, resolution, 0, 0);

    const scale = Math.min(width / 15.9, height / 8.9);
    const { yaw, pitch } = view;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    function project([x, y, z]) {
      const across = cosYaw * x - sinYaw * z;
      const forward = sinYaw * x + cosYaw * z;
      return {
        x: width / 2 + across * scale,
        y: height * 0.57 - ((y - 0.65) * cosPitch - forward * sinPitch) * scale,
        depth: y * sinPitch + forward * cosPitch,
      };
    }

    function polygon(points, close = true) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      if (close) context.closePath();
    }

    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#263931");
    background.addColorStop(1, "#14251e");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const ground = -1.17;
    context.strokeStyle = "#b3c4ad36";
    context.lineWidth = 1;
    for (let x = -8; x <= 8; x += 1) {
      polygon([project([x, ground, -4]), project([x, ground, 4])], false);
      context.stroke();
    }
    for (let z = -4; z <= 4; z += 1) {
      polygon([project([-8, ground, z]), project([8, ground, z])], false);
      context.stroke();
    }

    const projected = faces.map(({ vertices, color }) => {
      const points = vertices.map(project);
      const depth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
      return { points, depth, color };
    });
    projected.sort((first, second) => first.depth - second.depth);
    context.strokeStyle = "#1b211c64";
    context.lineWidth = 0.8;
    for (const face of projected) {
      polygon(face.points);
      context.fillStyle = face.color;
      context.fill();
      context.stroke();
    }
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
    draw();
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
  const deck = ["#efd0a3", "#d6aa78", "#b78455"];
  const timber = ["#e8b98b", "#c88e61", "#9f6645"];
  const bracing = ["#ee9969", "#c6764d", "#985238"];
  const joints = ["#c6cdb2", "#939f89", "#687767"];
  const foundation = ["#abb5a3", "#819083", "#596b60"];

  function beam(start, finish, width, depth, colors) {
    beams.push({ start, finish, width, depth, colors });
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

function beamFaces({ start, finish, width, depth, colors }) {
  const axis = finish.map((coordinate, index) => coordinate - start[index]);
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
  const sides = [2, 1, 0, 1].map((shade, index) => {
    const next = (index + 1) % 4;
    return { color: colors[shade], vertices: [first[index], first[next], second[next], second[index]] };
  });
  return [...sides, { color: colors[1], vertices: first }, { color: colors[1], vertices: second }];
}

function cross([ax, ay, az], [bx, by, bz]) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function normalise(vector) {
  const length = Math.hypot(...vector);
  return vector.map((coordinate) => coordinate / length);
}
