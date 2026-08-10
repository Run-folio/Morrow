"use client";

import { useEffect, useRef, useState } from "react";
import * as ThreeModule from "three";
import { createKaiModel } from "@/lib/create-kai-model";

const THREE: any = ThreeModule;

export default function RioPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;

    const boot = () => {
      if (cancelled || !mountRef.current) return;
      const mount = mountRef.current;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#f4efe7");

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      mount.appendChild(renderer.domElement);

      const { root: dog, head } = createKaiModel();
      dog.rotation.y = -0.5;
      scene.add(dog);

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(6, 64),
        new THREE.MeshStandardMaterial({ color: "#ddd2c2", roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      scene.add(new THREE.HemisphereLight("#fff7ea", "#72675f", 1.7));
      const key = new THREE.DirectionalLight("#fff1df", 3.0);
      key.position.set(4, 7, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      scene.add(key);
      const rim = new THREE.DirectionalLight("#e9a77b", 1.0);
      rim.position.set(-5, 3, -4);
      scene.add(rim);

      let targetRotation = dog.rotation.y;
      let isDragging = false;
      let startX = 0;
      const down = (event: PointerEvent) => { isDragging = true; startX = event.clientX; mount.setPointerCapture(event.pointerId); };
      const move = (event: PointerEvent) => { if (isDragging) { targetRotation += (event.clientX - startX) * 0.012; startX = event.clientX; } };
      const up = () => { isDragging = false; };
      mount.addEventListener("pointerdown", down);
      mount.addEventListener("pointermove", move);
      mount.addEventListener("pointerup", up);

      const resize = () => {
        const { width, height } = mount.getBoundingClientRect();
        camera.aspect = width / height;
        const bounds = new THREE.Box3().setFromObject(dog);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
        const limitingFov = Math.min(verticalFov, horizontalFov);
        const distance = (sphere.radius / Math.sin(limitingFov / 2)) * 1.18;
        const direction = new THREE.Vector3(1, 0.34, 1.15).normalize();
        camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
        camera.lookAt(sphere.center);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, true);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);
      resize();
      let frame = 0;
      const animate = () => {
        dog.rotation.y += (targetRotation - dog.rotation.y) * 0.08;
        const time = performance.now() * 0.001;
        head.rotation.z = Math.sin(time * 0.7) * 0.012;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      animate();
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        mount.removeEventListener("pointerdown", down);
        mount.removeEventListener("pointermove", move);
        mount.removeEventListener("pointerup", up);
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    boot();
    return () => { cancelled = true; cleanup(); };
  }, []);

  return (
    <main className="min-h-screen bg-[#f4efe7] px-5 py-6 text-[#2b211c] sm:px-10 sm:py-10">
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <div className="pb-4">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#ae623b]">3D study · 01</p>
          <h1 className="max-w-lg text-5xl font-medium leading-[0.95] tracking-[-0.06em] sm:text-7xl">Kai, in three dimensions.</h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-[#64554b]">A procedural Three.js portrait built from his three reference photos: ears, markings, paws, alert eyes and the unmistakable curled tail.</p>
          <p className="mt-7 text-sm font-medium text-[#8b7567]">Drag to turn Kai around.</p>
        </div>
        <div className="relative aspect-[1/1] min-h-[440px] overflow-hidden rounded-[2rem] border border-black/8 bg-[#f4efe7] shadow-[0_24px_80px_rgba(73,50,35,0.14)] sm:min-h-[580px]">
          <div ref={mountRef} className="absolute inset-0 touch-none" aria-label="Interactive 3D model of Kai the dog" />
          {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-[#8b7567]">Bringing Kai to life…</div>}
          <div className="pointer-events-none absolute bottom-5 left-6 rounded-full bg-white/70 px-4 py-2 text-xs font-medium tracking-wide text-[#6f5c50] backdrop-blur">Interactive model</div>
        </div>
      </section>
    </main>
  );
}
