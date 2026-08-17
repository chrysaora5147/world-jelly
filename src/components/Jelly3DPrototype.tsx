"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import * as THREE from "three";
import { JellyAudio } from "@/services/audio";

type PointerState = {
  id: number;
  active: boolean;
  hit: THREE.Vector3;
  normal: THREE.Vector3;
  plane: THREE.Plane;
  grab: THREE.Vector3;
  previous: THREE.Vector3;
  startedAt: number;
  expression: "default" | "squish" | "surprised" | "dizzy";
};

type FacePart = {
  group: THREE.Group;
  rest: THREE.Vector3;
  baseScale: THREE.Vector3;
};

const RINGS = 42;
const SEGMENTS = 96;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

function buildDomeGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const anchors: number[] = [];
  const faceWeights: number[] = [];

  for (let row = 0; row <= RINGS; row += 1) {
    const v = row / RINGS;
    const dome = Math.sin(v * Math.PI * 0.5);
    const baseSpread = smoothstep(0.7, 1, v) * 0.18;
    const radius = 0.1 + Math.pow(dome, 0.62) * (1.42 + baseSpread);
    const y = 1.12 - Math.pow(v, 1.42) * 1.58 - smoothstep(0.8, 1, v) * 0.08;
    const zScale = 0.74 + smoothstep(0.42, 1, v) * 0.12;

    for (let column = 0; column < SEGMENTS; column += 1) {
      const u = column / SEGMENTS;
      const angle = u * Math.PI * 2;
      const wobble = 1 + Math.sin(angle * 3 + v * 1.7) * 0.018 + Math.cos(angle * 5 - v * 2.1) * 0.012;
      const x = Math.cos(angle) * radius * wobble;
      const z = Math.sin(angle) * radius * zScale * wobble;
      const front = smoothstep(-0.38, -0.76, z);
      const faceBand = Math.exp(-((x / 0.72) ** 2 + ((y - 0.08) / 0.42) ** 2)) * front;

      positions.push(x, y, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
      anchors.push(smoothstep(0.72, 1, v));
      faceWeights.push(faceBand);
    }
  }

  for (let row = 0; row < RINGS; row += 1) {
    for (let column = 0; column < SEGMENTS; column += 1) {
      const next = (column + 1) % SEGMENTS;
      const a = row * SEGMENTS + column;
      const b = row * SEGMENTS + next;
      const c = (row + 1) * SEGMENTS + column;
      const d = (row + 1) * SEGMENTS + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    geometry,
    rest: new Float32Array(positions),
    velocity: new Float32Array(positions.length),
    anchors: new Float32Array(anchors),
    faceWeights: new Float32Array(faceWeights),
    vertexCount: positions.length / 3
  };
}

function makeEye() {
  const group = new THREE.Group();
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 24, 16),
    new THREE.MeshBasicMaterial({ color: "#051010" })
  );
  eye.scale.set(0.72, 1.18, 0.18);
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 12, 8),
    new THREE.MeshBasicMaterial({ color: "#ffffff" })
  );
  shine.position.set(-0.028, 0.048, -0.03);
  shine.scale.set(0.7, 1, 0.22);
  group.add(eye, shine);
  return group;
}

function makeCheek() {
  const cheek = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 12),
    new THREE.MeshBasicMaterial({ color: "#f7a0c2", transparent: true, opacity: 0.72 })
  );
  cheek.scale.set(1.35, 0.62, 0.14);
  const group = new THREE.Group();
  group.add(cheek);
  return group;
}

function makeMouth() {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.12, 0.015, 0),
    new THREE.Vector3(0, -0.09, 0),
    new THREE.Vector3(0.12, 0.015, 0)
  );
  const mouth = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, 0.018, 8, false),
    new THREE.MeshBasicMaterial({ color: "#051010" })
  );
  const group = new THREE.Group();
  group.add(mouth);
  return group;
}

function facePart(group: THREE.Group, x: number, y: number, z: number): FacePart {
  group.position.set(x, y, z);
  group.rotation.x = -0.12;
  group.scale.setScalar(1);
  return { group, rest: group.position.clone(), baseScale: group.scale.clone() };
}

export function Jelly3DPrototype() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<JellyAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    audioRef.current = new JellyAudio();
    return () => {
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#fbfaf7");

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.72, 5.3);
    camera.lookAt(0, 0.05, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const key = new THREE.DirectionalLight("#ffffff", 3);
    key.position.set(-2.4, 3.2, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.HemisphereLight("#dbfbff", "#fff0e6", 1.8);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#8ee2e5", 1.2);
    rim.position.set(2.3, 1.8, -2.4);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);

    const { geometry, rest, velocity, anchors, faceWeights, vertexCount } = buildDomeGeometry();
    const material = new THREE.MeshPhysicalMaterial({
      color: "#87e8f4",
      roughness: 0.22,
      metalness: 0,
      transmission: 0.28,
      thickness: 1.45,
      ior: 1.32,
      attenuationColor: new THREE.Color("#8ee2e5"),
      attenuationDistance: 2.8,
      transparent: true,
      opacity: 0.72,
      clearcoat: 0.58,
      clearcoatRoughness: 0.18,
      side: THREE.FrontSide
    });
    material.wireframe = wireframe;

    const jelly = new THREE.Mesh(geometry, material);
    jelly.castShadow = true;
    jelly.receiveShadow = true;
    world.add(jelly);

    const baseMaterial = new THREE.MeshPhysicalMaterial({
      color: "#83e5ef",
      roughness: 0.24,
      transmission: 0.25,
      thickness: 0.4,
      transparent: true,
      opacity: 0.26,
      clearcoat: 0.35
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.88, 0.08, 96), baseMaterial);
    base.position.y = -0.62;
    base.scale.z = 0.54;
    base.renderOrder = -2;
    base.castShadow = true;
    base.receiveShadow = true;
    world.add(base);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.82, 96),
      new THREE.MeshBasicMaterial({ color: "#1a7c94", transparent: true, opacity: 0.12 })
    );
    shadow.position.y = -0.585;
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.z = 0.48;
    shadow.renderOrder = -3;
    world.add(shadow);

    const face = new THREE.Group();
    const parts = {
      leftEye: facePart(makeEye(), -0.46, 0.06, 1.18),
      rightEye: facePart(makeEye(), 0.46, 0.06, 1.18),
      leftCheek: facePart(makeCheek(), -0.72, -0.1, 1.16),
      rightCheek: facePart(makeCheek(), 0.72, -0.1, 1.16),
      mouth: facePart(makeMouth(), 0, -0.14, 1.2)
    };
    Object.values(parts).forEach((part) => face.add(part.group));
    face.renderOrder = 3;
    face.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.renderOrder = 3;
        object.material.depthTest = false;
        object.material.depthWrite = false;
      }
    });
    world.add(face);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerState = { current: null as PointerState | null };
    const dragPoint = new THREE.Vector3();
    const pull = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    let animationFrame = 0;
    let previousTime = performance.now();
    let expressionTimer = 0;

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const updateExpression = (expression: PointerState["expression"], duration = 460) => {
      expressionTimer = performance.now() + duration;
      if (pointerState.current) {
        pointerState.current.expression = expression;
      }
    };

    const applyImpulse = (hit: THREE.Vector3, surfaceNormal: THREE.Vector3, strength: number) => {
      const radius = 0.46;
      const ringRadius = 0.38;
      for (let index = 0; index < vertexCount; index += 1) {
        const i = index * 3;
        const rx = rest[i];
        const ry = rest[i + 1];
        const rz = rest[i + 2];
        const dx = rx - hit.x;
        const dy = ry - hit.y;
        const dz = rz - hit.z;
        const distance = Math.hypot(dx, dy, dz);
        const dent = Math.exp(-(distance * distance) / (2 * radius * radius));
        const ring = Math.exp(-((distance - ringRadius) ** 2) / (2 * (radius * 0.28) ** 2));
        const bottom = 1 - anchors[index] * 0.72;
        const face = 1 - faceWeights[index] * 0.45;
        const outX = dx / (distance || 1);
        const outY = dy / (distance || 1);
        const outZ = dz / (distance || 1);

        velocity[i] += -surfaceNormal.x * dent * strength * bottom * face + outX * ring * strength * 0.32;
        velocity[i + 1] += -surfaceNormal.y * dent * strength * bottom * face + outY * ring * strength * 0.18;
        velocity[i + 2] += -surfaceNormal.z * dent * strength * bottom * face + outZ * ring * strength * 0.32;
      }
    };

    const findHit = () => {
      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObject(jelly);
      return hit;
    };

    const handleDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      setPointer(event);
      const hit = findHit();
      if (!hit?.face) {
        return;
      }

      const localHit = hit.point.clone();
      jelly.worldToLocal(localHit);
      normal.copy(hit.face.normal).normalize();
      const planeNormal = camera.getWorldDirection(new THREE.Vector3()).negate();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, hit.point);

      pointerState.current = {
        id: event.pointerId,
        active: true,
        hit: localHit.clone(),
        normal: normal.clone(),
        plane,
        grab: localHit.clone(),
        previous: localHit.clone(),
        startedAt: performance.now(),
        expression: "surprised"
      };
      applyImpulse(localHit, normal, 0.54);
      updateExpression("surprised", 520);
      audioRef.current?.poke("soft");
    };

    const handleMove = (event: PointerEvent) => {
      setPointer(event);
      const state = pointerState.current;
      if (!state?.active || state.id !== event.pointerId) {
        const tiltX = pointer.x * 0.055;
        const tiltY = pointer.y * 0.035;
        jelly.rotation.y += (tiltX - jelly.rotation.y) * 0.06;
        jelly.rotation.x += (tiltY - jelly.rotation.x) * 0.04;
        face.rotation.copy(jelly.rotation);
        return;
      }

      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(state.plane, dragPoint)) {
        const localDragPoint = dragPoint.clone();
        jelly.worldToLocal(localDragPoint);
        state.previous.copy(state.grab);
        state.grab.copy(localDragPoint);
        const travel = state.grab.distanceTo(state.hit);
        if (travel > 0.28) {
          updateExpression(travel > 0.72 ? "dizzy" : "squish", 380);
        }
      }
    };

    const handleUp = (event: PointerEvent) => {
      const state = pointerState.current;
      if (!state?.active || state.id !== event.pointerId) {
        return;
      }

      pull.subVectors(state.grab, state.hit);
      const power = clamp(pull.length() / 1.05, 0, 1);
      for (let index = 0; index < vertexCount; index += 1) {
        const i = index * 3;
        const dx = rest[i] - state.hit.x;
        const dy = rest[i + 1] - state.hit.y;
        const dz = rest[i + 2] - state.hit.z;
        const influence = Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * 0.82 * 0.82));
        const bottom = 1 - anchors[index] * 0.58;
        velocity[i] += -pull.x * influence * 1.65 * bottom;
        velocity[i + 1] += -pull.y * influence * 1.45 * bottom + Math.sin(rest[i] * 2.5) * power * 0.12;
        velocity[i + 2] += -pull.z * influence * 1.65 * bottom;
      }
      pointerState.current = null;
      updateExpression(power > 0.68 ? "dizzy" : "default", 620);
      audioRef.current?.release(power);
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 560 ? 1.35 : 1.65));
      renderer.setSize(width, height);
      const scale = width < 560 ? 0.46 : 1;
      world.scale.setScalar(scale);
    };

    const animate = (time: number) => {
      const delta = clamp((time - previousTime) / 1000, 0.001, 0.033);
      previousTime = time;
      const state = pointerState.current;
      const spring = reducedMotion ? 32 : 18;
      const damping = reducedMotion ? 11 : 6.4;

      if (state?.active) {
        const hold = clamp((time - state.startedAt) / 900, 0, 1);
        pull.subVectors(state.grab, state.hit);
        const travel = clamp(pull.length(), 0, 1.16);
        const radius = 0.55 + hold * 0.18;

        for (let index = 0; index < vertexCount; index += 1) {
          const i = index * 3;
          const dx = rest[i] - state.hit.x;
          const dy = rest[i + 1] - state.hit.y;
          const dz = rest[i + 2] - state.hit.z;
          const distance = Math.hypot(dx, dy, dz);
          const influence = Math.exp(-(distance * distance) / (2 * radius * radius));
          const bottom = 1 - anchors[index] * 0.8;
          const face = 1 - faceWeights[index] * 0.4;
          const targetX = rest[i] + pull.x * 1.6 * influence * bottom * face;
          const targetY = rest[i + 1] + pull.y * 1.6 * influence * bottom * face;
          const targetZ = rest[i + 2] + pull.z * 1.6 * influence * bottom * face;
          const side = Math.sign(rest[i]) || 1;

          velocity[i] += (targetX - position.getX(index)) * 66 * delta;
          velocity[i + 1] += (targetY - position.getY(index)) * 66 * delta;
          velocity[i + 2] += (targetZ - position.getZ(index)) * 66 * delta;

          if (pull.y < -0.1) {
            velocity[i] += side * Math.abs(pull.y) * smoothstep(0.58, 1, anchors[index]) * 3.5 * delta;
          }

          if (travel > 0.48) {
            velocity[i] += side * travel * (1 - anchors[index]) * 0.85 * delta;
          }
        }
      }

      for (let index = 0; index < vertexCount; index += 1) {
        const i = index * 3;
        const anchor = anchors[index];
        const face = 1 + faceWeights[index] * 0.45;
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const idle = reducedMotion ? 0 : Math.sin(time / 610 + rest[i] * 2.1 + rest[i + 2] * 1.7) * 0.007;
        const stiffness = spring * (1 + anchor * 1.9) * face;
        const drag = damping + anchor * 4.2;

        velocity[i] += (rest[i] - x + idle * rest[i]) * stiffness * delta;
        velocity[i + 1] += (rest[i + 1] - y + idle * 0.35) * stiffness * delta;
        velocity[i + 2] += (rest[i + 2] - z + idle * rest[i + 2]) * stiffness * delta;

        const compression = clamp((rest[i + 1] - y) * 0.24, -0.06, 0.12);
        velocity[i] += rest[i] * compression * (1 - anchor * 0.4) * delta;
        velocity[i + 2] += rest[i + 2] * compression * (1 - anchor * 0.4) * delta;

        velocity[i] *= Math.max(0, 1 - drag * delta);
        velocity[i + 1] *= Math.max(0, 1 - drag * delta);
        velocity[i + 2] *= Math.max(0, 1 - drag * delta);

        const maxSide = 0.38 - anchor * 0.16;
        const maxUp = 0.54 - anchor * 0.26;
        const maxDown = 0.34 - anchor * 0.2;
        position.setXYZ(
          index,
          clamp(x + velocity[i] * delta, rest[i] - maxSide, rest[i] + maxSide),
          clamp(y + velocity[i + 1] * delta, rest[i + 1] - maxDown, rest[i + 1] + maxUp),
          clamp(z + velocity[i + 2] * delta, rest[i + 2] - maxSide, rest[i + 2] + maxSide)
        );
      }

      geometry.computeVertexNormals();
      position.needsUpdate = true;

      base.scale.x += ((state?.active && pull.y < -0.08 ? 1.08 : 1) - base.scale.x) * 0.08;
      base.scale.z += ((state?.active && pull.y < -0.08 ? 0.58 : 0.54) - base.scale.z) * 0.08;

      const currentExpression = state?.expression ?? (performance.now() < expressionTimer ? "dizzy" : "default");
      const squishScale = currentExpression === "squish" ? 0.72 : currentExpression === "dizzy" ? 0.82 : 1;
      const lookX = state?.active ? clamp(pull.x * 0.1, -0.045, 0.045) : 0;
      parts.leftEye.group.scale.set(parts.leftEye.baseScale.x, parts.leftEye.baseScale.y * squishScale, 1);
      parts.rightEye.group.scale.set(parts.rightEye.baseScale.x, parts.rightEye.baseScale.y * squishScale, 1);
      parts.mouth.group.scale.setScalar(currentExpression === "surprised" ? 1.15 : 1);

      for (const part of Object.values(parts)) {
        part.group.position.x += (part.rest.x + lookX - part.group.position.x) * 0.16;
        part.group.position.y += (part.rest.y + (state?.active ? pull.y * 0.035 : 0) - part.group.position.y) * 0.12;
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", handleDown);
    renderer.domElement.addEventListener("pointermove", handleMove);
    renderer.domElement.addEventListener("pointerup", handleUp);
    renderer.domElement.addEventListener("pointercancel", handleUp);
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handleDown);
      renderer.domElement.removeEventListener("pointermove", handleMove);
      renderer.domElement.removeEventListener("pointerup", handleUp);
      renderer.domElement.removeEventListener("pointercancel", handleUp);
      container.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      base.geometry.dispose();
      baseMaterial.dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [wireframe]);

  return (
    <main className="jelly-3d-shell">
      <header className="jelly-3d-topbar">
        <div>
          <p className="eyebrow">WORLD JELLY 3D TEST</p>
          <p className="jelly-3d-helper">poke • drag • squish</p>
        </div>
        <nav className="jelly-3d-tabs" aria-label="World Jelly views">
          <Link href="/">2D</Link>
          <Link className="is-active" href="/jelly-3d">
            3D Test
          </Link>
        </nav>
        <div className="jelly-3d-controls">
          <button
            className="icon-button"
            type="button"
            aria-label={wireframe ? "Hide wireframe" : "Show wireframe"}
            title={wireframe ? "Hide wireframe" : "Show wireframe"}
            onClick={() => setWireframe((value) => !value)}
          >
            W
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            title={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </header>

      <section className="jelly-3d-stage" aria-label="Interactive 3D jelly prototype">
        <div ref={containerRef} className="jelly-3d-canvas" />
      </section>
    </main>
  );
}
