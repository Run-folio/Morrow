import * as THREE from "three";

type KaiRuntime = {
  root: THREE.Group;
  head: THREE.Group;
  tail: THREE.Mesh;
};

const TAN = 0xa85f39;
const TAN_DARK = 0x7b3f28;
const WHITE = 0xf3ead9;
const CREAM = 0xd9c9b3;

function seededNoiseTexture(
  base: [number, number, number],
  variation: number,
  seed: number,
) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const fine = random() * 2 - 1;
      const directional = Math.sin(y * 0.72 + Math.sin(x * 0.11) * 2.2) * 0.34;
      const value = fine * 0.66 + directional;
      image.data[index] = THREE.MathUtils.clamp(base[0] + value * variation, 0, 255);
      image.data[index + 1] = THREE.MathUtils.clamp(base[1] + value * variation, 0, 255);
      image.data[index + 2] = THREE.MathUtils.clamp(base[2] + value * variation, 0, 255);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 4;
  return texture;
}

function heightTexture(seed: number) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  let state = seed >>> 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      state = (state * 1103515245 + 12345) >>> 0;
      const grain = (state / 4294967296) * 38;
      const strand = Math.sin(y * 0.95 + x * 0.08) * 23;
      const value = THREE.MathUtils.clamp(128 + grain + strand, 0, 255);
      const index = (y * size + x) * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 5);
  return texture;
}

export function createKaiModel(): KaiRuntime {
  const root = new THREE.Group();
  root.name = "Kai";

  const tanMap = seededNoiseTexture([168, 95, 57], 21, 31);
  const whiteMap = seededNoiseTexture([240, 230, 211], 13, 83);
  const furHeight = heightTexture(117);
  const tanFur = new THREE.MeshStandardMaterial({
    color: TAN,
    map: tanMap,
    bumpMap: furHeight,
    bumpScale: 0.018,
    roughness: 0.93,
  });
  const whiteFur = new THREE.MeshStandardMaterial({
    color: WHITE,
    map: whiteMap,
    bumpMap: furHeight,
    bumpScale: 0.015,
    roughness: 0.96,
  });
  const creamFur = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.92, bumpMap: furHeight, bumpScale: 0.01 });
  const innerEar = new THREE.MeshPhysicalMaterial({ color: 0x9c6860, roughness: 0.72, clearcoat: 0.06, side: THREE.DoubleSide });
  const noseMaterial = new THREE.MeshPhysicalMaterial({ color: 0x1b1817, roughness: 0.37, clearcoat: 0.18, clearcoatRoughness: 0.48 });
  const eyeDark = new THREE.MeshPhysicalMaterial({ color: 0x160e0b, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0x6a3925, roughness: 0.12, clearcoat: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151211, roughness: 0.55 });

  const sphere = new THREE.SphereGeometry(1, 48, 32);
  const capsule = (radius: number, length: number) => new THREE.CapsuleGeometry(radius, length, 10, 22);
  const add = <T extends THREE.Object3D>(object: T, parent: THREE.Object3D = root) => {
    parent.add(object);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  };
  const ellipsoid = (
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number],
    parent: THREE.Object3D = root,
  ) => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    return add(mesh, parent);
  };

  // White base coat and Kai's compact, slightly deep-chested silhouette.
  ellipsoid(whiteFur, [0, 1.46, 0], [1.72, 0.72, 0.64]);
  ellipsoid(whiteFur, [0.93, 1.66, 0], [0.72, 0.86, 0.66]);
  ellipsoid(whiteFur, [-1.13, 1.55, 0], [0.72, 0.68, 0.62]);
  // Two reference-matched tan saddle regions, separated by a clear white band.
  ellipsoid(tanFur, [-0.95, 1.73, 0], [0.76, 0.54, 0.655]);
  ellipsoid(tanFur, [0.72, 1.73, 0], [0.61, 0.46, 0.66]);

  const head = new THREE.Group();
  head.name = "headPivot";
  head.position.set(1.15, 2.08, 0);
  add(head);
  ellipsoid(tanFur, [0.34, 0.49, 0], [0.77, 0.77, 0.66], head);
  // Cheeks soften the skull-to-muzzle transition.
  ellipsoid(creamFur, [0.68, 0.26, 0.39], [0.48, 0.39, 0.29], head);
  ellipsoid(creamFur, [0.68, 0.26, -0.39], [0.48, 0.39, 0.29], head);
  ellipsoid(creamFur, [0.92, 0.12, 0], [0.67, 0.37, 0.42], head);
  ellipsoid(whiteFur, [1.05, 0.06, 0], [0.58, 0.29, 0.38], head);
  // Narrow blaze down the forehead and bridge of the nose.
  const blaze = ellipsoid(whiteFur, [0.48, 0.73, 0], [0.18, 0.48, 0.665], head);
  blaze.rotation.z = -0.08;

  const nose = ellipsoid(noseMaterial, [1.56, 0.14, 0], [0.25, 0.19, 0.31], head);
  nose.rotation.z = -0.03;
  ellipsoid(black, [1.69, 0.17, 0.17], [0.055, 0.035, 0.07], head);
  ellipsoid(black, [1.69, 0.17, -0.17], [0.055, 0.035, 0.07], head);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.015, 8, 28, Math.PI * 0.88), black);
  mouth.position.set(1.35, -0.11, 0);
  mouth.rotation.set(Math.PI / 2, 0, Math.PI * 0.56);
  add(mouth, head);

  const addEye = (side: number) => {
    const socket = ellipsoid(black, [0.93, 0.55, side * 0.525], [0.25, 0.22, 0.095], head);
    socket.rotation.y = side * 0.11;
    ellipsoid(iris, [0.98, 0.565, side * 0.585], [0.16, 0.16, 0.055], head);
    ellipsoid(eyeDark, [1.015, 0.57, side * 0.618], [0.087, 0.105, 0.028], head);
    ellipsoid(new THREE.MeshBasicMaterial({ color: 0xffffff }), [1.045, 0.625, side * 0.64], [0.035, 0.035, 0.014], head);
  };
  addEye(1);
  addEye(-1);

  const addEar = (side: number) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.28, 5, 2), tanFur);
    ear.position.set(0.1, 1.37, side * 0.44);
    ear.scale.z = 0.62;
    ear.rotation.z = side * -0.08;
    add(ear, head);
    const inset = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.91, 5, 1, true), innerEar);
    inset.position.set(0.18, 1.34, side * 0.665);
    inset.scale.z = 0.25;
    inset.rotation.z = side * -0.08;
    add(inset, head);
  };
  addEar(1);
  addEar(-1);

  const addWhiskers = (side: number) => {
    const material = new THREE.LineBasicMaterial({ color: 0x6e625b, transparent: true, opacity: 0.66 });
    for (let index = 0; index < 4; index += 1) {
      const start = new THREE.Vector3(1.25 + index * 0.045, 0.14 - index * 0.055, side * 0.39);
      const end = new THREE.Vector3(1.68 + index * 0.12, 0.1 - index * 0.075, side * (0.72 + index * 0.07));
      add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material), head);
    }
  };
  addWhiskers(1);
  addWhiskers(-1);

  const addLeg = (x: number, side: number, front: boolean) => {
    const z = side * 0.43;
    const upperLength = front ? 0.58 : 0.5;
    const upper = new THREE.Mesh(capsule(front ? 0.19 : 0.21, upperLength), front ? whiteFur : tanFur);
    upper.position.set(x, 0.93, z);
    upper.rotation.z = front ? -0.04 : 0.12;
    add(upper);
    ellipsoid(whiteFur, [x + (front ? 0.04 : -0.06), 0.62, z], [0.23, 0.23, 0.22]);
    const lower = new THREE.Mesh(capsule(0.15, 0.48), whiteFur);
    lower.position.set(x + (front ? 0.08 : -0.1), 0.37, z);
    add(lower);
    const pawX = x + (front ? 0.18 : -0.02);
    ellipsoid(creamFur, [pawX, 0.12, z], [0.31, 0.14, 0.25]);
    for (let toe = -1; toe <= 1; toe += 1) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.095, 10), black);
      claw.position.set(pawX + 0.26, 0.12, z + toe * 0.075);
      claw.rotation.z = -Math.PI / 2;
      add(claw);
    }
  };
  addLeg(1.08, 1, true);
  addLeg(1.08, -1, true);
  addLeg(-1.12, 1, false);
  addLeg(-1.12, -1, false);

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.54, 1.67, 0),
    new THREE.Vector3(-2.06, 2.0, 0.02),
    new THREE.Vector3(-2.2, 2.63, 0.04),
    new THREE.Vector3(-1.86, 3.04, 0.04),
    new THREE.Vector3(-1.4, 2.92, 0.02),
    new THREE.Vector3(-1.33, 2.56, 0.01),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 72, 0.17, 16), whiteFur);
  tail.name = "tail";
  add(tail);
  ellipsoid(tanFur, [-1.64, 1.85, 0], [0.35, 0.29, 0.24]);

  root.userData.sculptRuntime = { nodes: { head, tail }, sockets: { neck: head.position.clone() } };
  return { root, head, tail };
}
