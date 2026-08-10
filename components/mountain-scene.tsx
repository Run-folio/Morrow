"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const COLUMNS = 148;
const ROWS = 76;
const POINT_COUNT = COLUMNS * ROWS;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ridgeHeight(x: number, depth: number) {
  const center = Math.exp(-Math.pow((x - 0.52) * 4.9, 2)) * (3.35 - depth * 0.74);
  const left = Math.exp(-Math.pow((x - 0.27) * 7.8, 2)) * (1.35 - depth * 0.42);
  const right = Math.exp(-Math.pow((x - 0.74) * 6.2, 2)) * (1.8 - depth * 0.46);
  const serration = Math.sin(x * 46 + depth * 4.6) * 0.11 + Math.sin(x * 94) * 0.045;

  return center + left + right + serration;
}

function createCircleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");

  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(32, 32, 30, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function MountainScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const containerElement = mountRef.current;
    if (!containerElement) return;
    const container: HTMLDivElement = containerElement;

    const reducedMotion = prefersReducedMotion();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    camera.position.set(0, 1.15, 8.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const cursorSpot = document.createElement("div");
    cursorSpot.setAttribute("aria-hidden", "true");
    cursorSpot.style.position = "absolute";
    cursorSpot.style.left = "0";
    cursorSpot.style.top = "0";
    cursorSpot.style.width = "clamp(14px, 1.35vw, 24px)";
    cursorSpot.style.height = "clamp(14px, 1.35vw, 24px)";
    cursorSpot.style.borderRadius = "9999px";
    cursorSpot.style.background = "#ff3d8b";
    cursorSpot.style.opacity = "0";
    cursorSpot.style.pointerEvents = "none";
    cursorSpot.style.transform = "translate3d(-50%, -50%, 0) scale(0.9)";
    cursorSpot.style.willChange = "transform, opacity";
    container.appendChild(cursorSpot);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(POINT_COUNT * 3);
    const colors = new Float32Array(POINT_COUNT * 3);
    const baseColors = new Float32Array(POINT_COUNT * 3);
    const base = new Float32Array(POINT_COUNT * 3);
    const phases = new Float32Array(POINT_COUNT);
    const influence = new Float32Array(POINT_COUNT);

    for (let row = 0; row < ROWS; row += 1) {
      const depth = row / (ROWS - 1);
      const rowOffset = row % 2 === 0 ? 0 : 0.5 / COLUMNS;

      for (let column = 0; column < COLUMNS; column += 1) {
        const index = row * COLUMNS + column;
        const progress = column / (COLUMNS - 1);
        const xProgress = THREE.MathUtils.clamp(progress + rowOffset, 0, 1);
        const z = -depth * 8.2;
        const x = (xProgress - 0.5) * (19.2 - depth * 1.35);
        const height = ridgeHeight(xProgress, depth);
        const valley = Math.pow(depth, 1.42) * 2.18;
        const centerBase =
          Math.exp(-Math.pow((xProgress - 0.52) * 3.05, 2)) *
          Math.exp(-Math.pow((depth - 0.68) * 2.35, 2)) *
          0.58;
        const rawY = -3.15 + height - valley + centerBase + Math.sin(depth * 20 + xProgress * 4.4) * 0.09;
        const baseBlend = THREE.MathUtils.smoothstep(depth, 0.62, 1) * 0.78;
        const basePlane = -3.55 + Math.sin(xProgress * Math.PI) * 0.05;
        const y = THREE.MathUtils.lerp(rawY, basePlane, baseBlend);

        const i3 = index * 3;
        base[i3] = x;
        base[i3 + 1] = y;
        base[i3 + 2] = z;
        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;
        phases[index] = Math.sin(index * 12.9898) * 43758.5453;
        influence[index] = 1 - depth * 0.72;
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const circleTexture = createCircleTexture();
    const material = new THREE.PointsMaterial({
      size: 0.047,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      vertexColors: true,
      depthWrite: false,
      alphaMap: circleTexture ?? undefined,
      alphaTest: 0.08,
    });

    const cloud = new THREE.Points(geometry, material);
    cloud.position.set(1.15, 0.28, 0);
    cloud.scale.setScalar(1.5);
    scene.add(cloud);

    const mouse = new THREE.Vector2(0, 0);
    const target = new THREE.Vector2(0, 0);
    const hoverColor = new THREE.Color("#C8E6CD");
    let scrollProgress = 0;
    let pointerActive = false;
    let hoverStrength = 0;
    let frame = 0;

    function themeColors() {
      const isDark = document.documentElement.classList.contains("dark");
      return {
        peak: new THREE.Color(isDark ? "#f4f3ef" : "#111111"),
        field: new THREE.Color(isDark ? "#9a9f98" : "#92938e"),
        far: new THREE.Color(isDark ? "#565c57" : "#dad8d0"),
      };
    }

    function syncTheme() {
      const palette = themeColors();

      for (let index = 0; index < POINT_COUNT; index += 1) {
        const i3 = index * 3;
        const y = base[i3 + 1];
        const zDepth = Math.abs(base[i3 + 2]) / 8.2;
        const peakMix = THREE.MathUtils.clamp((y + 2.35) / 3.35, 0, 1);
        const color = palette.far.clone().lerp(palette.field, 1 - zDepth).lerp(palette.peak, peakMix * 0.86);

        baseColors[i3] = color.r;
        baseColors[i3 + 1] = color.g;
        baseColors[i3 + 2] = color.b;
        colors[i3] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;
      }

      const colorAttribute = geometry.getAttribute("color");
      colorAttribute.needsUpdate = true;
      material.opacity = document.documentElement.classList.contains("dark") ? 0.72 : 0.58;
    }

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    syncTheme();

    function resize() {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.position.z = clientWidth < 700 ? 10.2 : 8.6;
      camera.updateProjectionMatrix();
    }

    function onPointerMove(event: PointerEvent) {
      const rect = container.getBoundingClientRect();
      pointerActive =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      target.x = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
      target.y = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    }

    function onScroll() {
      const rect = container.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      scrollProgress = THREE.MathUtils.clamp((viewport - rect.top) / (viewport + rect.height), 0, 1);
    }

    function animate() {
      frame = window.requestAnimationFrame(animate);
      mouse.lerp(target, reducedMotion ? 0.08 : 0.36);
      hoverStrength = THREE.MathUtils.lerp(hoverStrength, pointerActive && !reducedMotion ? 1 : 0, 0.22);

      const elapsed = reducedMotion ? 0 : performance.now() * 0.001;
      const positionAttribute = geometry.getAttribute("position");
      const colorAttribute = geometry.getAttribute("color");
      const pointerX = mouse.x * 8.1 - cloud.position.x * 0.65;
      const pointerY = -0.85 - mouse.y * 2.9;
      const repelRadius = 0.68;
      const repelRadiusSq = repelRadius * repelRadius;
      const colorRadius = 1.8;
      const colorRadiusSq = colorRadius * colorRadius;
      const spotX = ((mouse.x + 1) / 2) * container.clientWidth;
      const spotY = ((mouse.y + 1) / 2) * container.clientHeight;

      cursorSpot.style.opacity = `${hoverStrength * 0.95}`;
      cursorSpot.style.transform = `translate3d(${spotX}px, ${spotY}px, 0) translate(-50%, -50%) scale(${
        0.9 + hoverStrength * 0.1
      })`;

      cloud.rotation.y = mouse.x * 0.25;
      cloud.rotation.x = -0.1 + mouse.y * 0.075;
      cloud.position.x = 1.36 + mouse.x * 0.48;
      cloud.position.y = -0.08 + scrollProgress * 0.24;
      camera.lookAt(0.42 + mouse.x * 0.34, -1.18 + mouse.y * 0.18, -2.9);
      camera.updateMatrixWorld();
      cloud.updateMatrixWorld();

      for (let index = 0; index < POINT_COUNT; index += 1) {
        const i3 = index * 3;
        const x = base[i3];
        const y = base[i3 + 1];
        const z = base[i3 + 2];
        const depth = Math.abs(z) / 8.2;
        const pull = influence[index];
        const phase = phases[index];
        const ripple = Math.sin(elapsed * 3.4 + phase + mouse.x * 3.8) * (reducedMotion ? 0 : 0.04);
        const wake = Math.sin((x * 0.72 + z * 0.45) + mouse.x * 2.5 + elapsed * 2.1) * (reducedMotion ? 0 : 0.075);
        const dx = x - pointerX;
        const dy = y - pointerY;
        const distSq = dx * dx + dy * dy;
        const repel = reducedMotion || distSq > repelRadiusSq ? 0 : Math.pow(1 - Math.sqrt(distSq) / repelRadius, 2) * 0.72;
        const dist = Math.sqrt(distSq) || 1;
        const repelX = (dx / dist) * repel * (1.0 + depth * 0.32);
        const repelY = (dy / dist) * repel * (1.0 + pull * 0.2);

        positions[i3] = x + mouse.x * (0.92 * pull + depth * 0.28) + ripple + repelX;
        positions[i3 + 1] = y + mouse.y * (0.62 * pull) + wake + repelY;
        positions[i3 + 2] = z + mouse.x * depth * 0.82 - scrollProgress * 0.68 + repel * (0.28 + depth * 0.24);

        const colorMix =
          hoverStrength === 0 || distSq > colorRadiusSq
            ? 0
            : Math.pow(1 - dist / colorRadius, 0.72) * hoverStrength;

        colors[i3] = THREE.MathUtils.lerp(baseColors[i3], hoverColor.r, colorMix);
        colors[i3 + 1] = THREE.MathUtils.lerp(baseColors[i3 + 1], hoverColor.g, colorMix);
        colors[i3 + 2] = THREE.MathUtils.lerp(baseColors[i3 + 2], hoverColor.b, colorMix);
      }

      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      renderer.render(scene, camera);
    }

    resize();
    onScroll();
    animate();

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      circleTexture?.dispose();
      renderer.dispose();
      cursorSpot.remove();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -inset-y-16 z-0 opacity-90 mix-blend-multiply dark:opacity-70 dark:mix-blend-screen"
    />
  );
}
