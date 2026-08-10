"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createTableOrnamentModel } from "@/lib/create-table-ornament-model";

export default function OrnamentPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x141210);
      scene.fog = new THREE.FogExp2(0x141210, 0.018);
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      mount.appendChild(renderer.domElement);

      const model = createTableOrnamentModel();
      model.position.y = 0.22;
      model.rotation.y = -0.42;
      scene.add(model);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(9, 96),
        new THREE.MeshStandardMaterial({ color: 0x211d19, roughness: 0.3, metalness: 0.05 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.16;
      floor.receiveShadow = true;
      scene.add(floor);

      scene.add(new THREE.HemisphereLight(0xfff1d6, 0x241c18, 1.25));
      const key = new THREE.DirectionalLight(0xffe1ad, 4.2);
      key.position.set(4.8, 7.5, 5.5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xaed6e8, 1.65);
      fill.position.set(-5, 3.2, 4);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffc36d, 2.4);
      rim.position.set(-3, 5.5, -5);
      scene.add(rim);

      let targetRotation = model.rotation.y;
      let dragging = false;
      let startX = 0;
      const pointerDown = (event: PointerEvent) => {
        dragging = true;
        startX = event.clientX;
        mount.setPointerCapture(event.pointerId);
      };
      const pointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        targetRotation += (event.clientX - startX) * 0.01;
        startX = event.clientX;
      };
      const pointerUp = () => { dragging = false; };
      mount.addEventListener("pointerdown", pointerDown);
      mount.addEventListener("pointermove", pointerMove);
      mount.addEventListener("pointerup", pointerUp);

      const frameModel = () => {
        const { width, height } = mount.getBoundingClientRect();
        if (!width || !height || !renderer) return;
        camera.aspect = width / height;
        const bounds = new THREE.Box3().setFromObject(model);
        const boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
        const limitingFov = Math.min(verticalFov, horizontalFov);
        // 34% breathing room beyond the full bounding sphere prevents clipping at every breakpoint.
        const distance = (boundingSphere.radius / Math.sin(limitingFov / 2)) * 1.34;
        const direction = new THREE.Vector3(1, 0.68, 1.32).normalize();
        camera.position.copy(boundingSphere.center).add(direction.multiplyScalar(distance));
        camera.lookAt(boundingSphere.center);
        camera.near = Math.max(0.05, distance - boundingSphere.radius * 2.2);
        camera.far = distance + boundingSphere.radius * 4;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, true);
      };
      observer = new ResizeObserver(frameModel);
      observer.observe(mount);
      frameModel();

      const animate = () => {
        if (disposed || !renderer) return;
        model.rotation.y += (targetRotation - model.rotation.y) * 0.075;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      animate();
      setReady(true);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer?.disconnect();
        mount.removeEventListener("pointerdown", pointerDown);
        mount.removeEventListener("pointermove", pointerMove);
        mount.removeEventListener("pointerup", pointerUp);
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
        renderer?.dispose();
        renderer?.domElement.remove();
      };
    } catch (renderError) {
      console.error("Unable to initialize ornament viewer", renderError);
      setError(true);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#efeae0] px-5 py-6 text-[#211d19] sm:px-10 sm:py-10">
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
        <div className="pb-4">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#9a6b2f]">3D study · 02</p>
          <h1 className="max-w-lg text-5xl font-medium leading-[0.95] tracking-[-0.06em] sm:text-7xl">Coral geometry, cast in gold.</h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-[#665d54]">Five perforated sculptural forms arranged in a rippled glass dish, rebuilt from three reference views.</p>
          <p className="mt-7 text-sm font-medium text-[#88796b]">Drag across the model to rotate it.</p>
        </div>
        <div className="relative aspect-[1/1] min-h-[460px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#141210] shadow-[0_28px_90px_rgba(55,39,23,0.22)] sm:min-h-[620px]">
          <div ref={mountRef} className="absolute inset-0 touch-none" aria-label="Interactive 3D model of a gold table ornament in a glass dish" />
          {!ready && !error && <div className="absolute inset-0 grid place-items-center text-sm text-[#c2aa86]">Building the ornament…</div>}
          {error && <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-[#d5bf9d]">The 3D viewer could not start on this device.</div>}
          <div className="pointer-events-none absolute bottom-5 left-6 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-medium tracking-wide text-[#ead7b7] backdrop-blur">Full model · auto-framed</div>
        </div>
      </section>
    </main>
  );
}
