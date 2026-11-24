import {
  Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3,
} from "./vendor/three.module.min.js";

export const worktop = -1.16;
export const bridgeTimeline = [
  { end: 0.10, label: "Bench preparation" },
  { end: 0.30, label: "Laying the deck" },
  { end: 0.46, label: "First side truss" },
  { end: 0.60, label: "Second side truss" },
  { end: 0.66, label: "Tying the span together" },
  { end: 0.70, label: "Checking the finished span" },
  { end: 1, label: "360° inspection" },
];

export function clampProgress(value) {
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(value) {
  const t = clampProgress(value);
  return t * t * (3 - 2 * t);
}

const alongX = new Vector3(1, 0, 0);
const alongY = new Vector3(0, 1, 0);

export function timberTransform({ start, finish }) {
  const first = new Vector3(...start);
  const last = new Vector3(...finish);
  const axis = last.clone().sub(first).normalize();
  const across = new Vector3().crossVectors(axis, Math.abs(axis.y) > 0.96 ? alongX : alongY).normalize();
  const up = new Vector3().crossVectors(across, axis);
  return {
    position: first.clone().lerp(last, 0.5),
    rotation: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axis, up, across)),
    length: first.distanceTo(last),
    heading: Math.atan2(-axis.z, axis.x),
  };
}

// The original span uses seven lower and six upper nodes per side.
function buildBridge() {
  const stages = Array.from({ length: 5 }, () => []);
  const bottom = [-6, -4, -2, 0, 2, 4, 6];
  const top = [-5, -3, -1, 1, 3, 5];
  const height = 2.35;
  const halfWidth = 1.4;

  function timber(stage, start, finish, height, width, kind = "stick", extra = {}) {
    stages[stage].push({ start, finish, height, width, kind, ...extra });
  }

  for (const x of [-5.7, 5.7]) {
    for (const y of [-0.965, -0.58]) {
      timber(0, [x, y, -1.75], [x, y, 1.75], 0.39, 1.04, "jig");
    }
  }
  for (const z of [-1.12, 0, 1.12]) {
    timber(0, [-6.18, -0.279, z], [6.18, -0.279, z], 0.22, 0.24, "jig");
  }
  for (let index = 0; index < 31; index++) {
    const x = -6 + index * 0.4;
    const thickness = 0.107 + (index % 5) * 0.002;
    const y = -0.169 + thickness / 2;
    timber(1, [x, y, -1.53], [x, y, 1.53], thickness, 0.375 + (index % 3) * 0.004,
      "stick", { stockIndex: index });
  }

  for (const [index, side] of [1, -1].entries()) {
    const stage = index + 2;
    const z = side * halfWidth;
    const outside = z + side * 0.105;
    const plate = z + side * 0.176;
    for (let node = 0; node < bottom.length - 1; node += 2) {
      timber(stage, [bottom[node] - 0.06, 0.046, z], [bottom[node + 2] + 0.06, 0.046, z], 0.215, 0.22);
    }
    for (const x of top) {
      timber(stage, [x, 0.12, z], [x, height - 0.065, z], 0.13, 0.085);
    }
    for (let node = 0; node < top.length - 1; node += 2) {
      timber(stage, [top[node] - 0.12, height, z], [top[Math.min(node + 2, 5)] + 0.12, height, z], 0.19, 0.21);
    }
    top.forEach((x, node) => {
      timber(stage, [bottom[node], 0.06, outside], [x, height, outside], 0.16, 0.115);
      timber(stage, [bottom[node + 1], 0.06, outside], [x, height, outside], 0.16, 0.115);
    });
    for (const [nodes, y] of [[bottom, 0.07], [top, height]]) {
      for (const x of nodes) {
        timber(stage, [x - 0.20, y, plate], [x + 0.20, y, plate], 0.245, 0.052, "splice",
          { glue: side * 0.019 });
      }
    }
  }

  for (const x of top) {
    timber(4, [x, height + 0.084, -halfWidth], [x, height + 0.084, halfWidth], 0.11, 0.164);
  }
  for (let index = 0; index + 1 < top.length; index++) {
    const side = index % 2 ? halfWidth : -halfWidth;
    timber(4, [top[index], height + 0.171, side], [top[index + 1], height + 0.171, -side], 0.073, 0.123);
  }
  return stages;
}

export function createBridgeModel(geometryFor, materials) {
  const group = new Group();
  const batches = new Map();
  const dummy = new Object3D();
  const shifted = new Matrix4();
  const orientation = new Matrix4();
  const shade = new Color();
  const stages = buildBridge();
  const memberCount = stages.reduce((total, parts) => total + parts.length, 0);
  const preparation = bridgeTimeline[0].end;
  const grainTints = [0xfff2db, 0xeed4aa, 0xf8e5c9, 0xe0b98c, 0xf3dcba, 0xe9c9a1, 0xf9e9d3];

  function register(part, kind) {
    const shape = geometryFor(part.length, part.height, part.width, kind);
    const material = materials[kind];
    const key = shape.id + ":" + material.id;
    if (!batches.has(key)) batches.set(key, { shape, material, entries: [] });
    batches.get(key).entries.push(part);
  }

  for (const [stage, parts] of stages.entries()) {
    const start = stage ? bridgeTimeline[stage - 1].end : preparation * 0.1;
    const end = bridgeTimeline[stage].end;
    const step = (end - start) / (parts.length + 0.26);
    parts.forEach((beam, index) => {
      const begin = start + step * index;
      const part = {
        ...beam, ...timberTransform(beam), stage,
        begin,
        end: index === parts.length - 1 ? end : begin + step * 1.26,
        tint: grainTints[(index * 5 + stage * 3) % grainTints.length],
      };
      const side = stage === 3 || stage === 4 ? -1 : 1;
      part.rest = new Vector3(
        part.position.x + Math.sin(index * 2) * 0.12,
        worktop + beam.height / 2 + 0.005,
        side * (stage === 0 ? 5.05 : 4.75),
      );
      part.flat = new Quaternion().setFromAxisAngle(alongY, part.heading + (index % 3 - 1) * 0.07);
      if (beam.stockIndex !== undefined) {
        // Two stacks per bundle. Install the top plank first so the stock always rests on the bench.
        const bundleSize = 6;
        const bundle = Math.floor(beam.stockIndex / bundleSize);
        const positionInBundle = beam.stockIndex % bundleSize;
        const bundleEnd = Math.min((bundle + 1) * bundleSize, parts.length);
        let supportHeight = 0;
        for (let lower = beam.stockIndex + 2; lower < bundleEnd; lower += 2) {
          supportHeight += parts[lower].height;
        }
        part.rest.set(-5.35 + bundle * 1.91 + (positionInBundle % 2) * 0.48,
          worktop + beam.height / 2 + supportHeight + 0.005, bundle % 2 ? -4.84 : -3.85);
        part.flat.setFromAxisAngle(alongY, part.heading + (bundle % 2 ? -0.09 : 0.11));
      }
      register(part, beam.kind);
      if (part.glue) {
        register({
          ...part, length: 0.18, height: 0.024, width: 0.024, tint: 0xffffff,
          offset: new Matrix4().makeTranslation(0.015, -0.116, part.glue),
        }, "glue");
      }
    });
  }

  for (const batch of batches.values()) {
    const { shape, material, entries } = batch;
    batch.mesh = new InstancedMesh(shape, material, entries.length);
    batch.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    batch.mesh.count = 0;
    batch.mesh.frustumCulled = false;
    batch.mesh.castShadow = true;
    batch.mesh.receiveShadow = true;
    entries.forEach((part, index) => batch.mesh.setColorAt(index, shade.setHex(part.tint)));
    group.add(batch.mesh);
  }

  function seek(progress) {
    let assembled = 0;
    let changed = false;
    for (const { mesh, entries } of batches.values()) {
      let visible = 0;
      let firstDirty = entries.length;
      let lastDirty = -1;
      // Each batch is in assembly order. Any stock planks are at the front and stay visible.
      for (const part of entries) {
        if (part.stockIndex === undefined && progress < part.begin) break;
        const index = visible++;
        const amount = clampProgress((progress - part.begin) / (part.end - part.begin));
        if (amount === 1 && !part.offset) assembled++;
        if (part.amount === amount) continue;
        part.amount = amount;
        firstDirty = Math.min(firstDirty, index);
        lastDirty = index;
        const eased = smoothstep(amount);
        if (amount === 1) {
          dummy.position.copy(part.position);
          dummy.quaternion.copy(part.rotation);
        } else {
          dummy.position.copy(part.rest).lerp(part.position, eased);
          dummy.quaternion.slerpQuaternions(part.flat, part.rotation, eased);
          if (amount > 0) {
            const lift = part.stage === 1 ? 0.39 : 0.70;
            dummy.position.y += lift * Math.sin(Math.PI * amount) ** 2;
            const basis = orientation.makeRotationFromQuaternion(dummy.quaternion).elements;
            const clearance = (Math.abs(basis[1]) * part.length + Math.abs(basis[5]) * part.height
              + Math.abs(basis[9]) * part.width) / 2;
            dummy.position.y = Math.max(dummy.position.y, worktop + clearance);
          }
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(index, part.offset ? shifted.multiplyMatrices(dummy.matrix, part.offset) : dummy.matrix);
      }
      if (lastDirty >= firstDirty) {
        mesh.instanceMatrix.addUpdateRange(firstDirty * 16, (lastDirty - firstDirty + 1) * 16);
        mesh.instanceMatrix.needsUpdate = true;
        changed = true;
      }
      if (mesh.count !== visible) changed = true;
      mesh.count = visible;
    }
    return { assembled, changed };
  }

  return { group, seek, memberCount };
}
