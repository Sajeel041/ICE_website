import {
  BoxGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, DataTexture, DirectionalLight,
  EquirectangularReflectionMapping, Group, HemisphereLight, InstancedMesh, LatheGeometry,
  LinearFilter, LinearSRGBColorSpace, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  MirroredRepeatWrapping, PlaneGeometry, RGBAFormat, SRGBColorSpace, Texture, TubeGeometry, Vector2, Vector3,
} from "./vendor/three.module.min.js";
import { RGBELoader } from "./vendor/RGBELoader.js";
import { bridgeTimeline, smoothstep, timberTransform, worktop } from "./bridge-model.js";

export async function loadWorkshopTextures(anisotropy, getAsset, waitForTurn) {
  const names = ["birch-color", "birch-normal", "birch-surface", "bench-color", "bench-normal", "bench-surface"];
  const jobs = names.map(async (name) => {
    const url = URL.createObjectURL(await getAsset(name + ".webp"));
    try {
      const start = performance.now();
      const image = new Image();
      image.src = url;
      await image.decode();
      performance.measure("bridge:decode-" + name, { start });
      const texture = new Texture(image);
      texture.wrapS = texture.wrapT = MirroredRepeatWrapping;
      texture.anisotropy = anisotropy;
      if (name.endsWith("-color")) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const room = getAsset("carpentry.hdr").then(async (data) => {
    await waitForTurn();
    const start = performance.now();
    const { data: pixels, width, height, type } = new RGBELoader().parse(data);
    const texture = new DataTexture(pixels, width, height, RGBAFormat, type);
    texture.colorSpace = LinearSRGBColorSpace;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.mapping = EquirectangularReflectionMapping;
    texture.flipY = true;
    texture.needsUpdate = true;
    performance.measure("bridge:hdr-decode", { start });
    return texture;
  });
  const results = await Promise.allSettled([...jobs, room]);
  const failure = results.find(({ status }) => status === "rejected");
  if (failure) {
    results.forEach(({ value }) => value?.dispose());
    throw failure.reason;
  }
  return Object.fromEntries([...names, "room"].map((name, index) => [name, results[index].value]));
}

export function createWorkshop(scene, textures, quality) {
  scene.backgroundBlurriness = 0.073;
  scene.backgroundIntensity = 0.47;
  scene.environmentIntensity = 0.54;
  scene.backgroundRotation.y = scene.environmentRotation.y = 0.65;

  const geometryCache = new Map();
  function geometryFor(length, height, width, kind) {
    const key = [length.toFixed(3), height, width, kind].join(":");
    if (geometryCache.has(key)) return geometryCache.get(key);
    const bevel = Math.min(height, width) * (kind === "stick" ? 0.25 : 0.18);
    // Each box face already owns its vertices, so rounded corners and grain UVs can keep the index.
    const geometry = new BoxGeometry(1, 1, 1, 3, 3, 3);
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const bench = kind === "bench";
    const normal = new Vector3();
    for (let index = 0; index < uv.count; index++) {
      const sx = Math.sign(positions.getX(index));
      const sy = Math.sign(positions.getY(index));
      const sz = Math.sign(positions.getZ(index));
      normal.set(positions.getX(index) - sx / 6, positions.getY(index) - sy / 6, positions.getZ(index) - sz / 6).normalize();
      positions.setXYZ(index, (length / 2 - bevel) * sx + normal.x * bevel,
        (height / 2 - bevel) * sy + normal.y * bevel, (width / 2 - bevel) * sz + normal.z * bevel);
      normals.setXYZ(index, normal.x, normal.y, normal.z);
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      const nx = Math.abs(normals.getX(index)), ny = Math.abs(normals.getY(index)), nz = Math.abs(normals.getZ(index));
      const end = nx > ny && nx > nz;
      const crossGrain = ny > nz ? z : y;
      const u = end ? z : x;
      uv.setXY(index, 0.48 + u / (bench ? 17 : 5.5), 0.39 + (end ? y : crossGrain) / (bench ? 12 : 3.4));
    }
    geometryCache.set(key, geometry);
    return geometry;
  }

  function wood(family, color, roughness, normalStrength) {
    return new MeshStandardMaterial({
      color, roughness, metalness: 0,
      map: textures[family + "-color"],
      normalMap: textures[family + "-normal"],
      normalScale: new Vector2(normalStrength, normalStrength),
      roughnessMap: textures[family + "-surface"],
      aoMap: textures[family + "-surface"],
      aoMapIntensity: 0.72,
    });
  }

  const materials = {
    stick: wood("birch", 0xffffff, 1, 0.48),
    jig: wood("birch", 0xe4bd88, 1, 0.6),
    splice: wood("birch", 0xe5cda6, 1, 0.34),
    glue: new MeshStandardMaterial({ color: 0x947047, roughness: 0.74 }),
    bench: wood("bench", 0xa39582, 1, 0.63),
  };

  const benchParts = new Map();
  const unitScale = new Vector3(1, 1, 1);
  function timber(beam, parent = scene) {
    const { position, rotation, length } = timberTransform(beam);
    const geometry = geometryFor(length, beam.height, beam.width, beam.kind);
    if (beam.kind === "bench") {
      if (!benchParts.has(geometry)) benchParts.set(geometry, []);
      benchParts.get(geometry).push(new Matrix4().compose(position, rotation, unitScale));
      return;
    }
    const part = new Mesh(geometry, materials[beam.kind]);
    part.position.copy(position);
    part.quaternion.copy(rotation);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  timber({
    start: [-15, worktop - 0.29, 1.6], finish: [15, worktop - 0.29, 1.6],
    height: 0.58, width: 21.4, kind: "bench",
  });
  for (const x of [-12.4, 12.4]) {
    for (const z of [-7, 10.25]) {
      timber({ start: [x, -6.3, z], finish: [x, worktop - 0.56, z], height: 0.95, width: 0.95, kind: "bench" });
    }
    timber({ start: [x, worktop - 1.04, -7.1], finish: [x, worktop - 1.04, 10.35], height: 0.93, width: 0.42, kind: "bench" });
  }
  for (const z of [-7, 10.25]) {
    timber({ start: [-12.45, worktop - 1.04, z], finish: [12.45, worktop - 1.04, z], height: 0.93, width: 0.42, kind: "bench" });
  }
  for (const [geometry, matrices] of benchParts) {
    const batch = new InstancedMesh(geometry, materials.bench, matrices.length);
    matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
    batch.receiveShadow = true;
    scene.add(batch);
  }

  const sky = new HemisphereLight(0xf4f3ee, 0x9b7656, 1.03);
  const key = new DirectionalLight(0xffe8cc, 2.35);
  key.position.set(-7, 12, 5.5);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 0.8, far: 28 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.setScalar(quality === "compact" ? 1024 : 2048);
  key.shadow.normalBias = 0.024;
  key.shadow.bias = -0.00031;
  key.shadow.radius = quality === "compact" ? 2.5 : 3.2;
  const bounce = new DirectionalLight(0xd6e8ff, 0.56);
  bounce.position.set(6, 6, -8);
  scene.add(sky, key, bounce);

  const contact = canvasTexture(96, 96, (context) => {
    const gradient = context.createRadialGradient(48, 48, 2, 48, 48, 48);
    gradient.addColorStop(0, "rgba(34, 19, 11, 0.62)");
    gradient.addColorStop(0.5, "rgba(34, 19, 11, 0.28)");
    gradient.addColorStop(1, "rgba(34, 19, 11, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
  });
  const contactMaterial = new MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false });
  function shadow(x, z, width, depth) {
    const patch = new Mesh(new PlaneGeometry(width, depth), contactMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, worktop + 0.004, z);
    scene.add(patch);
    return patch;
  }
  const supportContacts = [-5.7, 5.7].map((x) => {
    const patch = shadow(x, 0, 1.56, 4.12);
    patch.material = patch.material.clone();
    return patch;
  });

  addRuler(scene, shadow);
  addGlueBottle(scene, shadow);
  addClamps(scene, shadow);
  for (const [index, [x, z]] of [[-7.55, 3.45], [-7.70, 3.94], [-7.85, 4.48], [7.9, -2.12], [7.65, -2.57]].entries()) {
    const length = 2.2 + index * 0.15;
    const part = timber({
      start: [x - length / 2, worktop + 0.062, z - 0.24],
      finish: [x + length / 2, worktop + 0.062, z + 0.26],
      height: 0.12, width: 0.28, kind: "stick",
    });
    if (index % 2) part.rotateY(0.14);
  }

  return {
    geometryFor,
    materials,
    seek(progress) {
      const preparation = progress / bridgeTimeline[0].end;
      supportContacts.forEach((patch, index) => {
        const opacity = smoothstep((preparation - 0.208 - index * 0.25) / 0.075);
        patch.visible = opacity > 0;
        patch.material.opacity = opacity;
      });
    },
  };
}

function canvasTexture(width, height, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function addMesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addRuler(scene, shadow) {
  const ruler = new Group();
  ruler.position.set(1.05, worktop + 0.035, 3.13);
  ruler.rotation.y = 0.09;
  scene.add(ruler);
  shadow(1.05, 3.13, 10.5, 0.85);
  const steel = new MeshStandardMaterial({ color: 0xa3a6a5, metalness: 0.68, roughness: 0.57 });
  addMesh(new BoxGeometry(10, 0.061, 0.58), steel, ruler);
  const marks = canvasTexture(1024, 78, (ctx, width, height) => {
    const sheen = ctx.createLinearGradient(0, 0, 0, height);
    sheen.addColorStop(0, "#939796");
    sheen.addColorStop(0.34, "#c9c7be");
    sheen.addColorStop(1, "#9a9d98");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#292923";
    ctx.textAlign = "center";
    ctx.font = "16px sans-serif";
    for (let tick = 0; tick <= 240; tick++) {
      const x = 27 + tick * ((width - 54) / 240);
      const length = tick % 10 === 0 ? 30 : tick % 5 === 0 ? 19 : 10;
      ctx.fillRect(x, 0, tick % 10 === 0 ? 2 : 1, length);
      if (tick % 10 === 0) ctx.fillText(String(tick / 10), x, 52);
    }
  });
  const face = addMesh(new PlaneGeometry(9.98, 0.57), new MeshStandardMaterial({
    map: marks, metalness: 0.31, roughness: 0.59,
  }), ruler, 0, 0.0315);
  face.castShadow = false;
  face.rotation.x = -Math.PI / 2;
}

function addGlueBottle(scene, shadow) {
  const bottle = new Group();
  bottle.position.set(6.92, worktop, -3.5);
  bottle.rotation.y = -0.87;
  scene.add(bottle);
  shadow(6.92, -3.5, 1.66, 1.4);
  const plastic = new MeshStandardMaterial({ color: 0xeae3c5, roughness: 0.68 });
  const cap = new MeshStandardMaterial({ color: 0x9e481c, roughness: 0.59 });
  const contour = [[0, 0], [0.36, 0], [0.47, 0.11], [0.47, 1.11], [0.39, 1.35], [0.22, 1.48], [0.21, 1.62], [0, 1.62]];
  addMesh(new LatheGeometry(contour.map(([radius, height]) => new Vector2(radius, height)), 20), plastic, bottle);
  addMesh(new CylinderGeometry(0.245, 0.245, 0.19, 24), cap, bottle, 0, 1.59, 0);
  addMesh(new CylinderGeometry(0.048, 0.152, 0.43, 14), cap, bottle, 0, 1.88, 0);
  const label = canvasTexture(384, 112, (ctx, width, height) => {
    ctx.fillStyle = "#dacbb1";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#36483b";
    ctx.fillRect(0, 10, width, 8);
    ctx.fillRect(0, 94, width, 9);
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WOOD GLUE", 80, 54);
    ctx.fillText("WOOD GLUE", 272, 54);
    ctx.font = "15px sans-serif";
    ctx.fillText("PVA", 80, 78);
    ctx.fillText("PVA", 272, 78);
  });
  addMesh(new CylinderGeometry(0.472, 0.472, 0.71, 20, 1, true),
    new MeshStandardMaterial({ map: label, roughness: 0.77 }), bottle, 0, 0.68, 0);
}

function addClamps(scene, shadow) {
  const castIron = new MeshStandardMaterial({ color: 0x444e45, metalness: 0.48, roughness: 0.74 });
  const steel = new MeshStandardMaterial({ color: 0x8e8d83, metalness: 0.74, roughness: 0.46 });
  const grip = new MeshStandardMaterial({ color: 0x733b23, roughness: 0.83 });
  const outline = new CatmullRomCurve3([
    [0.48, -0.28], [0.07, -0.39], [-0.57, -0.31], [-0.74, 0.02], [-0.58, 0.37], [-0.13, 0.48], [0.48, 0.4],
  ].map(([x, z]) => new Vector3(x, 0, z)));
  const body = new TubeGeometry(outline, 16, 0.105, 7, false);
  const vise = new CylinderGeometry(0.066, 0.066, 0.74, 10);
  for (const [x, z, angle] of [[-6.9, -2.55, 0.6], [6.0, 3.77, -0.53]]) {
    const clamp = new Group();
    clamp.position.set(x, worktop + 0.107, z);
    clamp.rotation.y = angle;
    scene.add(clamp);
    shadow(x, z, 1.76, 1.44);
    addMesh(body, castIron, clamp);
    addMesh(vise, steel, clamp, 0.46, 0.02, 0.46).rotation.x = Math.PI / 2;
    addMesh(new CylinderGeometry(0.13, 0.13, 0.045, 10), steel, clamp, 0.46, 0.02, 0.094).rotation.x = Math.PI / 2;
    addMesh(new CylinderGeometry(0.065, 0.065, 0.48, 9), grip, clamp, 0.46, 0.02, 0.86).rotation.z = Math.PI / 2;
  }
}
