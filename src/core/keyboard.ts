/**
 * Keyboard-driven camera controls.
 *
 *   z / x        → zoom in / out (acceleration toward/away from target)
 *   Arrow keys   → orbit camera (rotate around target) — full 360°
 *
 * Uses quaternion-based rotation for unrestricted 360° orbiting
 * in all directions (no gimbal lock, no polar clamping).
 * Camera up vector rotates together with the camera so that
 * lookAt() never flips at the poles.
 *
 * Scoped to a container element — only responds when focused.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface KeyboardControlState {
  /**
   * Called each frame. Returns true when keyboard is driving camera,
   * signalling the caller to skip OrbitControls.update().
   */
  update: () => boolean;
  cleanup: () => void;
}

interface Velocity {
  zoom: number;
  azimuth: number;
  polar: number;
}

const ACCEL = 0.0012;
const MAX_SPEED = 0.06;
const DAMPING = 0.88;
const ZOOM_FACTOR = 0.015;
const DEAD_ZONE = 0.0001;

// Reusable objects (avoid per-frame GC)
const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function setupKeyboardControls(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  container: HTMLElement
): KeyboardControlState {
  const keys: Record<string, boolean> = {};
  const vel: Velocity = { zoom: 0, azimuth: 0, polar: 0 };

  function onKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    keys[e.key] = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    keys[e.key] = false;
  }
  function onBlur() {
    for (const k of Object.keys(keys)) keys[k] = false;
    vel.zoom = 0;
    vel.azimuth = 0;
    vel.polar = 0;
  }

  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("keyup", onKeyUp);
  container.addEventListener("blur", onBlur);

  function update(): boolean {
    if (keys["z"] || keys["Z"]) vel.zoom -= ACCEL;
    if (keys["x"] || keys["X"]) vel.zoom += ACCEL;
    if (keys["ArrowLeft"])  vel.azimuth -= ACCEL;
    if (keys["ArrowRight"]) vel.azimuth += ACCEL;
    if (keys["ArrowUp"])    vel.polar -= ACCEL;
    if (keys["ArrowDown"])  vel.polar += ACCEL;

    vel.zoom    = clamp(vel.zoom,    -MAX_SPEED, MAX_SPEED);
    vel.azimuth = clamp(vel.azimuth, -MAX_SPEED, MAX_SPEED);
    vel.polar   = clamp(vel.polar,   -MAX_SPEED, MAX_SPEED);

    vel.zoom    *= DAMPING;
    vel.azimuth *= DAMPING;
    vel.polar   *= DAMPING;

    if (Math.abs(vel.zoom)    < DEAD_ZONE) vel.zoom = 0;
    if (Math.abs(vel.azimuth) < DEAD_ZONE) vel.azimuth = 0;
    if (Math.abs(vel.polar)   < DEAD_ZONE) vel.polar = 0;

    const hasMotion = vel.zoom !== 0 || vel.azimuth !== 0 || vel.polar !== 0;
    if (!hasMotion) return false;

    const target = controls.target as THREE.Vector3;
    _offset.copy(camera.position).sub(target);
    let radius = _offset.length();

    // Zoom
    if (vel.zoom !== 0) {
      radius *= (1 + vel.zoom * ZOOM_FACTOR * radius * 0.01);
      radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, radius));
    }

    // Left/Right: rotate offset around camera's local up vector
    if (vel.azimuth !== 0) {
      _q.setFromAxisAngle(camera.up, -vel.azimuth);
      _offset.applyQuaternion(_q);
    }

    // Up/Down: rotate offset AND camera.up around camera's local right vector
    // This is the key to continuous 360° polar rotation — the up vector
    // co-rotates so lookAt() never encounters a singularity.
    if (vel.polar !== 0) {
      // Camera right = cross(camera direction, camera up)
      _right.copy(_offset).normalize().cross(camera.up).normalize();
      if (_right.lengthSq() < 0.001) {
        // Fallback: extract right from camera matrix
        _right.setFromMatrixColumn(camera.matrixWorld, 0);
      }
      _q.setFromAxisAngle(_right, vel.polar);
      _offset.applyQuaternion(_q);
      camera.up.applyQuaternion(_q).normalize();
    }

    // Apply
    _offset.normalize().multiplyScalar(radius);
    camera.position.copy(target).add(_offset);
    camera.lookAt(target);

    // Keep OrbitControls in sync so mouse interaction resumes correctly
    controls.target.copy(target);

    return true;
  }

  function cleanup() {
    container.removeEventListener("keydown", onKeyDown);
    container.removeEventListener("keyup", onKeyUp);
    container.removeEventListener("blur", onBlur);
  }

  return { update, cleanup };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
