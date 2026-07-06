/**
 * Keyboard-driven camera controls with two modes:
 *
 * **Orbit mode**:
 *   z / x        → zoom in / out (acceleration toward/away from target)
 *   Arrow keys   → orbit camera (rotate around target) — full 360°
 *   Azimuth auto-corrects when camera is upside down (past 180° pitch).
 *
 * **Fly mode** (default):
 *   Z / X        → thrust forward / backward
 *   A / D / ← / → → yaw (turn left / right)
 *   W / S / ↑ / ↓ → pitch (up / down)
 *   Inertia-based with friction decay.
 *   Yaw direction auto-corrects when camera is upside down.
 *
 * Both modes use quaternion rotation for gimbal-lock-free movement.
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
  /** Update the fly speed multiplier at runtime */
  setFlySpeed: (speed: number) => void;
  /** Enable/disable keyboard camera control (disabled in 2D mode) */
  setEnabled: (enabled: boolean) => void;
  /** Switch control scheme at runtime ("pan" is used by 2D mode) */
  setMode: (mode: "fly" | "orbit" | "pan") => void;
}

/* ── Orbit mode constants (constant speed, no acceleration) ── */
const ORBIT_ROTATE_SPEED = 0.058;
const ORBIT_ZOOM_FACTOR = 0.015;

/* ── Fly mode constants (constant speed, no acceleration) ── */
const FLY_THRUST_SPEED = 0.056;
const FLY_TURN_RATE = 0.041;

// Reusable objects (avoid per-frame GC)
const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/* ── Pan mode constants (2D plane navigation) ── */
const PAN_SPEED = 0.02;   // fraction of camera-target distance per frame
const PAN_ZOOM_FACTOR = 0.02;

/* ── Pan mode: arrows/WASD pan in screen space, z/x dolly (2D mode) ── */
function createPanUpdate(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  keys: Record<string, boolean>
): () => boolean {
  const _panRight = new THREE.Vector3();
  const _panUp = new THREE.Vector3();
  const _panOffset = new THREE.Vector3();

  return function update(): boolean {
    let dx = 0;
    let dy = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) dx -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) dx += 1;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) dy += 1;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) dy -= 1;
    const zoomIn = keys["z"] || keys["Z"] || keys["+"] || keys["="];
    const zoomOut = keys["x"] || keys["X"] || keys["-"] || keys["_"];

    if (!dx && !dy && !zoomIn && !zoomOut) return false;

    const target = controls.target as THREE.Vector3;
    const dist = camera.position.distanceTo(target);

    if (dx || dy) {
      // Screen-aligned pan: move camera + target along the camera's
      // local right/up axes so it stays intuitive when the plane is tilted
      const step = Math.max(dist, 50) * PAN_SPEED;
      _panRight.setFromMatrixColumn(camera.matrix, 0);
      _panUp.setFromMatrixColumn(camera.matrix, 1);
      _panOffset
        .set(0, 0, 0)
        .addScaledVector(_panRight, dx * step)
        .addScaledVector(_panUp, dy * step);
      camera.position.add(_panOffset);
      target.add(_panOffset);
    }

    if (zoomIn || zoomOut) {
      const factor = zoomIn ? -PAN_ZOOM_FACTOR : PAN_ZOOM_FACTOR;
      _panOffset.copy(camera.position).sub(target);
      const newLen = Math.max(
        controls.minDistance,
        Math.min(controls.maxDistance, _panOffset.length() * (1 + factor))
      );
      _panOffset.setLength(newLen);
      camera.position.copy(target).add(_panOffset);
    }

    return true;
  };
}

/* ── Orbit mode (constant speed, no velocity/friction) ── */
function createOrbitUpdate(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  keys: Record<string, boolean>
): () => boolean {
  return function update(): boolean {
    let zoom = 0;
    let azimuth = 0;
    let polar = 0;

    if (keys["z"] || keys["Z"]) zoom -= ORBIT_ROTATE_SPEED;
    if (keys["x"] || keys["X"]) zoom += ORBIT_ROTATE_SPEED;
    if (keys["ArrowLeft"])  azimuth -= ORBIT_ROTATE_SPEED;
    if (keys["ArrowRight"]) azimuth += ORBIT_ROTATE_SPEED;
    if (keys["ArrowUp"])    polar -= ORBIT_ROTATE_SPEED;
    if (keys["ArrowDown"])  polar += ORBIT_ROTATE_SPEED;

    const hasMotion = zoom !== 0 || azimuth !== 0 || polar !== 0;
    if (!hasMotion) return false;

    const target = controls.target as THREE.Vector3;
    _offset.copy(camera.position).sub(target);
    let radius = _offset.length();

    if (zoom !== 0) {
      radius *= (1 + zoom * ORBIT_ZOOM_FACTOR * radius * 0.01);
      radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, radius));
    }

    if (azimuth !== 0) {
      // When camera.up is flipped (past 180° pitch), rotating around the flipped
      // axis reverses the azimuth direction on screen — causing left/right inversion.
      // Flip the sign so orbit direction stays consistent regardless of orientation.
      const upDot = camera.up.dot(_worldUp);
      const azSign = upDot < 0 ? -1 : 1;
      _q.setFromAxisAngle(camera.up, -azimuth * azSign);
      _offset.applyQuaternion(_q);
    }

    if (polar !== 0) {
      _right.copy(_offset).normalize().cross(camera.up).normalize();
      if (_right.lengthSq() < 0.001) {
        _right.setFromMatrixColumn(camera.matrixWorld, 0);
      }
      _q.setFromAxisAngle(_right, polar);
      _offset.applyQuaternion(_q);
      camera.up.applyQuaternion(_q).normalize();
    }

    _offset.normalize().multiplyScalar(radius);
    camera.position.copy(target).add(_offset);
    camera.lookAt(target);
    controls.target.copy(target);

    return true;
  };
}

/* ── Fly mode (constant speed, no velocity/friction) ── */
function createFlyUpdate(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  keys: Record<string, boolean>,
  state: { flySpeed: number }
): () => boolean {
  return function update(): boolean {
    const speedMul = state.flySpeed;

    let thrust = 0;
    let yaw = 0;
    let pitch = 0;

    // Thrust (forward / backward along camera direction)
    if (keys["z"] || keys["Z"]) thrust += FLY_THRUST_SPEED * speedMul;
    if (keys["x"] || keys["X"]) thrust -= FLY_THRUST_SPEED * speedMul;

    // Yaw (left / right)
    if (keys["a"] || keys["A"] || keys["ArrowLeft"])  yaw += FLY_TURN_RATE;
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) yaw -= FLY_TURN_RATE;

    // Pitch (up / down)
    if (keys["w"] || keys["W"] || keys["ArrowUp"])    pitch += FLY_TURN_RATE;
    if (keys["s"] || keys["S"] || keys["ArrowDown"])  pitch -= FLY_TURN_RATE;

    const hasMotion = thrust !== 0 || yaw !== 0 || pitch !== 0;
    if (!hasMotion) return false;

    // ── Yaw: rotate around world Y axis ──
    // When camera is upside-down (up·worldY < 0), invert yaw
    // so that "left" input always moves the view left on screen.
    if (yaw !== 0) {
      const upDot = camera.up.dot(_worldUp);
      const yawSign = upDot < 0 ? -1 : 1;
      _q.setFromAxisAngle(_worldUp, yaw * yawSign);
      camera.quaternion.premultiply(_q);
      camera.up.applyQuaternion(_q).normalize();
    }

    // ── Pitch: rotate around camera-local right axis ──
    if (pitch !== 0) {
      _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      _q.setFromAxisAngle(_right, pitch);
      camera.quaternion.premultiply(_q);
      camera.up.applyQuaternion(_q).normalize();
    }

    // ── Thrust: move along camera's forward direction ──
    if (thrust !== 0) {
      const lookDist = camera.position.distanceTo(controls.target as THREE.Vector3);
      const distScale = Math.max(0.3, lookDist * 0.003);
      camera.getWorldDirection(_dir);
      _dir.multiplyScalar(thrust * distScale * 100);
      camera.position.add(_dir);
      (controls.target as THREE.Vector3).add(_dir);
    }

    return true;
  };
}

export function setupKeyboardControls(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  container: HTMLElement,
  mode: "fly" | "orbit" | "pan" = "fly",
  flySpeed: number = 1.0
): KeyboardControlState {
  const keys: Record<string, boolean> = {};
  const state = { flySpeed };

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
  }

  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("keyup", onKeyUp);
  container.addEventListener("blur", onBlur);

  let enabled = true;
  let currentMode: "fly" | "orbit" | "pan" = mode;
  const updaters: Record<"fly" | "orbit" | "pan", () => boolean> = {
    fly: createFlyUpdate(camera, controls, keys, state),
    orbit: createOrbitUpdate(camera, controls, keys),
    pan: createPanUpdate(camera, controls, keys),
  };
  const updateFn = () => (enabled ? updaters[currentMode]() : false);

  function cleanup() {
    container.removeEventListener("keydown", onKeyDown);
    container.removeEventListener("keyup", onKeyUp);
    container.removeEventListener("blur", onBlur);
  }

  function setFlySpeed(speed: number) {
    state.flySpeed = speed;
  }

  function setEnabled(on: boolean) {
    enabled = on;
    if (!on) for (const k of Object.keys(keys)) keys[k] = false;
  }

  function setMode(m: "fly" | "orbit" | "pan") {
    currentMode = m;
    for (const k of Object.keys(keys)) keys[k] = false;
  }

  return { update: updateFn, cleanup, setFlySpeed, setEnabled, setMode };
}
