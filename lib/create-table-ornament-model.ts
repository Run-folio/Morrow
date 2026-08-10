import * as THREE from "three";
import { tableOrnamentSpec } from "@/lib/table-ornament-spec";

const GOLD = 0xc49a57;
const GOLD_BRIGHT = 0xd7b873;
const GOLD_CAVITY = 0x362718;

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createIndependentNoiseTexture(seed: number, roughness = false) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  const random = randomFactory(seed);
  for (let index = 0; index < size * size; index += 1) {
    const broad = Math.sin((index % size) * 0.17) * 12;
    const value = roughness
      ? 116 + random() * 78 + broad * 0.35
      : 118 + random() * 72 + broad;
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

function fibonacciDirections(count: number, offset: number) {
  const directions: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 1 - ((index + 0.5) / count) * 2;
    const radius = Math.sqrt(1 - y * y);
    const angle = (index + offset) * goldenAngle;
    directions.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return directions;
}

function orientFromAxis(object: THREE.Object3D, axis: THREE.Vector3, direction: THREE.Vector3) {
  object.quaternion.setFromUnitVectors(axis, direction.clone().normalize());
}

function createPorousGoldForm(radius: number, seed: number) {
  const group = new THREE.Group();
  group.name = `porous-gold-form-${seed}`;
  const random = randomFactory(seed);
  const heightMap = createIndependentNoiseTexture(seed * 13 + 7);
  const roughnessMap = createIndependentNoiseTexture(seed * 29 + 11, true);
  const gold = new THREE.MeshStandardMaterial({
    color: GOLD,
    metalness: 0.82,
    roughness: 0.36,
    bumpMap: heightMap,
    bumpScale: 0.045,
    roughnessMap,
  });
  const brightGold = new THREE.MeshStandardMaterial({
    color: GOLD_BRIGHT,
    metalness: 0.86,
    roughness: 0.27,
    bumpMap: heightMap,
    bumpScale: 0.025,
  });
  const cavity = new THREE.MeshStandardMaterial({ color: GOLD_CAVITY, metalness: 0.35, roughness: 0.88, side: THREE.DoubleSide });

  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 3), gold);
  shell.scale.set(1, 0.96 + random() * 0.08, 0.98 + random() * 0.05);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  const zAxis = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const holeDirections = fibonacciDirections(18, seed * 0.41);
  holeDirections.forEach((direction, index) => {
    const holeRadius = radius * (0.105 + random() * 0.075);
    const cavityDisc = new THREE.Mesh(new THREE.CircleGeometry(holeRadius * 0.82, 24), cavity);
    cavityDisc.position.copy(direction).multiplyScalar(radius * 1.006);
    orientFromAxis(cavityDisc, zAxis, direction);
    group.add(cavityDisc);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(holeRadius, holeRadius * 0.23, 10, 28), brightGold);
    rim.position.copy(direction).multiplyScalar(radius * 1.025);
    orientFromAxis(rim, zAxis, direction);
    rim.scale.set(1, 0.84 + random() * 0.3, 1);
    rim.castShadow = true;
    group.add(rim);

    if (index % 3 === 0) {
      const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(holeRadius * 0.8, holeRadius * 0.68, radius * 0.11, 24, 1, true), cavity);
      innerWall.position.copy(direction).multiplyScalar(radius * 0.965);
      orientFromAxis(innerWall, yAxis, direction);
      group.add(innerWall);
    }
  });

  fibonacciDirections(30, seed * 0.77 + 2).forEach((direction) => {
    const height = radius * (0.1 + random() * 0.095);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(radius * (0.045 + random() * 0.025), height, 7), gold);
    spike.position.copy(direction).multiplyScalar(radius + height * 0.45);
    orientFromAxis(spike, yAxis, direction);
    spike.castShadow = true;
    group.add(spike);
  });

  const noduleGeometry = new THREE.SphereGeometry(radius * 0.018, 7, 5);
  const nodules = new THREE.InstancedMesh(noduleGeometry, brightGold, 120);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  fibonacciDirections(120, seed * 1.17 + 5).forEach((direction, index) => {
    const amount = 0.7 + random() * 0.75;
    scale.setScalar(amount);
    matrix.compose(direction.clone().multiplyScalar(radius * 1.012), new THREE.Quaternion(), scale);
    nodules.setMatrixAt(index, matrix);
  });
  nodules.castShadow = true;
  group.add(nodules);

  group.userData.component = {
    role: "perforated ornament module",
    collider: { type: "sphere", radius },
    repetition: tableOrnamentSpec.repetitionSystems,
  };
  return group;
}

function createGlassDish() {
  const radialSegments = 96;
  const rings = 26;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const exponent = 4.2;
  const halfWidth = 3.35;
  const halfDepth = 2.35;

  for (let ring = 0; ring <= rings; ring += 1) {
    const fraction = ring / rings;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const boundary = 1 / Math.pow(
        Math.pow(Math.abs(cosine) / halfWidth, exponent) + Math.pow(Math.abs(sine) / halfDepth, exponent),
        1 / exponent,
      );
      const x = cosine * boundary * fraction;
      const z = sine * boundary * fraction;
      const bowl = -0.34 * (1 - Math.pow(fraction, 2.15));
      const rimLift = Math.pow(fraction, 8) * (0.1 + Math.sin(angle * 3 + 0.45) * 0.085 + Math.sin(angle * 5.2) * 0.035);
      positions.push(x, bowl + rimLift, z);
      uvs.push(x / (halfWidth * 2) + 0.5, z / (halfDepth * 2) + 0.5);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const currentRow = ring * radialSegments;
      const nextRow = (ring + 1) * radialSegments;
      indices.push(currentRow + segment, nextRow + segment, nextRow + next);
      indices.push(currentRow + segment, nextRow + next, currentRow + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xddebe8,
    metalness: 0,
    roughness: 0.14,
    transmission: 0.88,
    thickness: 0.28,
    ior: 1.5,
    transparent: true,
    opacity: 0.84,
    clearcoat: 0.68,
    clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
  });
  const dish = new THREE.Mesh(geometry, material);
  dish.name = "cast-glass-dish";
  dish.receiveShadow = true;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.035, 8, 128),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe1df, transmission: 0.78, thickness: 0.4, roughness: 0.18, transparent: true, opacity: 0.72 }),
  );
  rim.scale.set(3.23, 2.2, 1);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.1;
  dish.add(rim);
  return dish;
}

export function createTableOrnamentModel() {
  const root = new THREE.Group();
  root.name = "gold-coral-table-ornament";
  const dish = createGlassDish();
  root.add(dish);

  const layout = [
    { position: [-1.2, 0.74, 0.55], radius: 0.75, seed: 11, rotation: [0.2, -0.4, 0.08] },
    { position: [0.1, 0.71, 0.74], radius: 0.72, seed: 23, rotation: [-0.12, 0.28, -0.08] },
    { position: [1.18, 0.78, 0.16], radius: 0.74, seed: 37, rotation: [0.1, 0.67, 0.16] },
    { position: [-0.48, 0.8, -0.48], radius: 0.7, seed: 49, rotation: [-0.18, 0.22, 0.04] },
    { position: [0.02, 1.8, -0.17], radius: 0.82, seed: 61, rotation: [0.14, -0.36, -0.05] },
  ] as const;
  const ornaments: THREE.Group[] = [];
  layout.forEach((item, index) => {
    const ornament = createPorousGoldForm(item.radius, item.seed);
    ornament.name = `gold-form-${index + 1}`;
    ornament.position.set(item.position[0], item.position[1], item.position[2]);
    ornament.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
    root.add(ornament);
    ornaments.push(ornament);
  });

  root.userData.sculptRuntime = {
    nodes: { dish, ornaments },
    colliders: ornaments.map((ornament, index) => ({ node: ornament.name, type: "sphere", radius: layout[index].radius })),
    sockets: { displayBase: new THREE.Vector3(0, 0, 0) },
    spec: tableOrnamentSpec,
  };
  return root;
}
