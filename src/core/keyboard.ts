/**
 * Keyboard-driven camera controls with two modes:
 *
 * **Orbit mode**:
 *   z / x        → zoom in / out (acceleration toward/away from target)
 *   Arrow keys   → orbit camera (rotate around target) — full 360°
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
}

/* ── Orbit mode constants ── */
const ORBIT_ACCEL = 0.0012;
const ORBIT_MAX_SPEED = 0.06;
const ORBIT_DAMPING = 0.88;
const ORBIT_ZOOM_FACTOR = 0.015;
const ORBIT_DEAD_ZONE = 0.0001;

/* ── Fly mode constants ── */
const FLY_ACCEL = 0.006;
const FLY_FRICTION = 0.92;
const FLY_MAX_THRUST = 0.18;
const FLY_TURN_RATE = 0.008;
const FLY_DEAD_ZONE = 0.0002;

// Reusable objects (avoid per-frame GC)
const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/* ── Orbit mode ── */
function createOrbitUpdate(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  keys: Record<string, boolean>
): () => boolean {
  const vel = { zoom: 0, azimuth: 0, polar: 0 };

  return function update(): boolean {
    if (keys["z"] || keys["Z"]) vel.zoom -= ORBIT_ACCEL;
    if (keys["x"] || keys["X"]) vel.zoom += ORBIT_ACCEL;
    if (keys["ArrowLeft"])  vel.azimuth -= ORBIT_ACCEL;
    if (keys["ArrowRight"]) vel.azimuth += ORBIT_ACCEL;
    if (keys["ArrowUp"])    vel.polar -= ORBIT_ACCEL;
    if (keys["ArrowDown"])  vel.polar += ORBIT_ACCEL;

    vel.zoom    = clamp(vel.zoom,    -ORBIT_MAX_SPEED, ORBIT_MAX_SPEED);
    vel.azimuth = clamp(vel.azimuth, -ORBIT_MAX_SPEED, ORBIT_MAX_SPEED);
    vel.polar   = clamp(vel.polar,   -ORBIT_MAX_SPEED, ORBIT_MAX_SPEED);

    vel.zoom    *= ORBIT_DAMPING;
    vel.azimuth *= ORBIT_DAMPING;
    vel.polar   *= ORBIT_DAMPING;

    if (Math.abs(vel.zoom)    < ORBIT_DEAD_ZONE) vel.zoom = 0;
    if (Math.abs(vel.azimuth) < ORBIT_DEAD_ZONE) vel.azimuth = 0;
    if (Math.abs(vel.polar)   < ORBIT_DEAD_ZONE) vel.polar = 0;

    const hasMotion = vel.zoom !== 0 || vel.azimuth !== 0 || vel.polar !== 0;
    if (!hasMotion) return false;

    const target = controls.target as THREE.Vector3;
    _offset.copy(camera.position).sub(target);
    let radius = _offset.length();

    if (vel.zoom !== 0) {
      radius *= (1 + vel.zoom * ORBIT_ZOOM_FACTOR * radius * 0.01);
      radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, radius));
    }

    if (vel.azimuth !== 0) {
      _q.setFromAxisAngle(camera.up, -vel.azimuth);
      _offset.applyQuaternion(_q);
    }

    if (vel.polar !== 0) {
      _right.copy(_offset).normalize().cross(camera.up).normalize();
      if (_right.lengthSq() < 0.001) {
        _right.setFromMatrixColumn(camera.matrixWorld, 0);
      }
      _q.setFromAxisAngle(_right, vel.polar);
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

/* ── Fly mode ── */
function createFlyUpdate(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  keys: Record<string, boolean>,
  state: { flySpeed: number }
): () => boolean {
  const vel = { thrust: 0, yaw: 0, pitch: 0 };

  return function update(): boolean {
    const speedMul = state.flySpeed;

    // Thrust (forward / backward along camera direction)
    if (keys["z"] || keys["Z"]) vel.thrust += FLY_ACCEL * speedMul;
    if (keys["x"] || keys["X"]) vel.thrust -= FLY_ACCEL * speedMul;

    // Yaw (left / right)
    if (keys["a"] || keys["A"] || keys["ArrowLeft"])  vel.yaw += FLY_TURN_RATE;
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) vel.yaw -= FLY_TURN_RATE;

    // Pitch (up / down)
    if (keys["w"] || keys["W"] || keys["ArrowUp"])    vel.pitch += FLY_TURN_RATE;
    if (keys["s"] || keys["S"] || keys["ArrowDown"])  vel.pitch -= FLY_TURN_RATE;

    // Distance-scaled clamping bounds
    const lookDist = camera.position.distanceTo(controls.target as THREE.Vector3);
    const distScale = Math.max(0.3, lookDist * 0.003);

    vel.thrust = clamp(vel.thrust, -FLY_MAX_THRUST * distScale * speedMul, FLY_MAX_THRUST * distScale * speedMul);
    vel.yaw    = clamp(vel.yaw,    -FLY_TURN_RATE * 2, FLY_TURN_RATE * 2);
    vel.pitch  = clamp(vel.pitch,  -FLY_TURN_RATE * 2, FLY_TURN_RATE * 2);

    vel.thrust *= FLY_FRICTION;
    vel.yaw    *= FLY_FRICTION;
    vel.pitch  *= FLY_FRICTION;

    if (Math.abs(vel.thrust) < FLY_DEAD_ZONE) vel.thrust = 0;
    if (Math.abs(vel.yaw)    < FLY_DEAD_ZONE) vel.yaw = 0;
    if (Math.abs(vel.pitch)  < FLY_DEAD_ZONE) vel.pitch = 0;

    const hasMotion = vel.thrust !== 0 || vel.yaw !== 0 || vel.pitch !== 0;
    if (!hasMotion) return false;

    // ── Yaw: rotate around world Y axis ──
    // Fix: when camera is upside-down (up·worldY < 0), invert yaw
    // so that "left" input always moves the view left on screen.
    if (vel.yaw !== 0) {
      const upDot = camera.up.dot(_worldUp);
      const yawSign = upDot < 0 ? -1 : 1;
      _q.setFromAxisAngle(_worldUp, vel.yaw * yawSign);
      camera.quaternion.premultiply(_q);
      // Co-rotate the up vector so it stays consistent
      camera.up.applyQuaternion(_q).normalize();
    }

    // ── Pitch: rotate around camera-local right axis ──
    if (vel.pitch !== 0) {
      _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      _q.setFromAxisAngle(_right, vel.pitch);
      camera.quaternion.premultiply(_q);
      camera.up.applyQuaternion(_q).normalize();
    }

    // ── Thrust: move along camera's forward direction ──
    if (vel.thrust !== 0) {
      camera.getWorldDirection(_dir);
      _dir.multiplyScalar(vel.thrust * distScale * 100);
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
  mode: "fly" | "orbit" = "fly",
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

  const updateFn = mode === "fly"
    ? createFlyUpdate(camera, controls, keys, state)
    : createOrbitUpdate(camera, controls, keys);

  function cleanup() {
    container.removeEventListener("keydown", onKeyDown);
    container.removeEventListener("keyup", onKeyUp);
    container.removeEventListener("blur", onBlur);
  }

  function setFlySpeed(speed: number) {
    state.flySpeed = speed;
  }

  return { update: updateFn, cleanup, setFlySpeed };
}
