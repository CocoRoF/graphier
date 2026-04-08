/**
 * Camera animation and control utilities.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
}

/** Smoothly animate camera to a new position/target using ease-out */
export function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetPos: CameraTarget,
  targetLookAt: CameraTarget,
  duration: number
): void {
  const startPos = camera.position.clone();
  const startTarget = (controls.target as THREE.Vector3).clone();
  const endPos = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
  const endTarget = new THREE.Vector3(
    targetLookAt.x,
    targetLookAt.y,
    targetLookAt.z
  );
  const start = performance.now();

  function step() {
    const t = Math.min((performance.now() - start) / duration, 1);
    const ease = t * (2 - t); // ease-out quadratic
    camera.position.lerpVectors(startPos, endPos, ease);
    (controls.target as THREE.Vector3).lerpVectors(startTarget, endTarget, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Compute camera position to fit all nodes in view */
export function zoomToFitPositions(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  positions: Float32Array,
  duration: number,
  padding: number
): void {
  const count = positions.length / 3;
  if (count === 0) return;

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  cx /= count;
  cy /= count;
  cz /= count;

  // Compute bounding sphere radius from centroid
  let maxR = 0;
  for (let i = 0; i < count; i++) {
    const dx = positions[i * 3] - cx;
    const dy = positions[i * 3 + 1] - cy;
    const dz = positions[i * 3 + 2] - cz;
    const r = dx * dx + dy * dy + dz * dz;
    if (r > maxR) maxR = r;
  }
  maxR = Math.sqrt(maxR);

  const fov = (camera.fov * Math.PI) / 180;
  const dist = (maxR + padding) / Math.sin(fov / 2);

  animateCamera(
    camera,
    controls,
    { x: cx, y: cy, z: cz + dist },
    { x: cx, y: cy, z: cz },
    duration
  );
}
