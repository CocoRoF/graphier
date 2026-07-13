/**
 * Three.js scene initialization: scene, camera, renderer, controls, post-processing.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { NavigationConfig, RendererConfig, StyleConfig } from "../types";
import { createStarField, createNebula } from "./effects";
import { createSelectionRing } from "./selection";
import {
  createLabelSystem,
  type LabelState,
} from "./label-system";
import { setupKeyboardControls, type KeyboardControlState } from "./keyboard";

export interface SceneState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  stars: THREE.Points;
  nebula: THREE.Mesh | null;
  /** ShaderMaterials with a `uTime` uniform driven by the animation clock. */
  animatedMaterials: THREE.ShaderMaterial[];
  selectionRing: THREE.Group;
  labels: LabelState;
  composer: EffectComposer | null;
  bloomPass: UnrealBloomPass | null;
  keyboard: KeyboardControlState;
  scrollCleanup: () => void;
  /** Mutable runtime flags shared with input handlers */
  flags: {
    is2D: boolean;
    keyboardMode3D: "fly" | "orbit";
    /** Pointer button that rotates via the trackball handler (null = off) */
    rotateButton: number | null;
    /** Base pan-speed multiplier (zoom-adaptive boost applies on top) */
    panSpeedBase: number;
  };
}

export function createScene(
  container: HTMLElement,
  backgroundColor: string,
  style: Required<StyleConfig>,
  rendererConfig?: RendererConfig
): SceneState {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;
  const camera = new THREE.PerspectiveCamera(60, w / h, 1, 50000);
  camera.position.set(0, 0, 800);

  const renderer = new THREE.WebGLRenderer({
    antialias: rendererConfig?.antialias ?? false,
    powerPreference: "high-performance",
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, rendererConfig?.pixelRatioMax ?? 1.5)
  );
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const canvas = renderer.domElement;
  canvas.style.setProperty("display", "block", "important");
  // Block native HTML5 drag / text-selection from hijacking pointer drags
  // (otherwise the browser can flip the cursor to "no-drop" mid-drag and
  // swallow the pan/rotate gesture).
  canvas.draggable = false;
  canvas.style.userSelect = "none";
  canvas.style.setProperty("-webkit-user-drag", "none");
  canvas.style.touchAction = "none";
  const onDragStart = (e: DragEvent) => e.preventDefault();
  canvas.addEventListener("dragstart", onDragStart);
  const onSelectStart = (e: Event) => e.preventDefault();
  canvas.addEventListener("selectstart", onSelectStart);
  container.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 1.2;
  controls.minDistance = 10;
  controls.maxDistance = 30000;
  // Pan always follows the screen axes — with world-plane panning a
  // vertical drag on a head-on camera degenerates into a dolly (reads
  // as an unwanted zoom).
  controls.screenSpacePanning = true;

  // Ambient light
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const animatedMaterials: THREE.ShaderMaterial[] = [];

  // Is the ground dark? Nebula + additive stars only read on dark space; on a
  // light ground they turn to noise, so gate the cosmic backdrop here.
  const bg = new THREE.Color(backgroundColor);
  const isDark = bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114 < 0.5;

  // Nebula backdrop (behind the stars). Void tint tracks the background so the
  // clouds fade into the scene's own darkness instead of a hard seam.
  let nebula: THREE.Mesh | null = null;
  if (isDark && style.nebula) {
    nebula = createNebula(40000, {
      void: backgroundColor,
      a: "#2a1a55", // violet
      b: "#0c3a4a", // teal
      c: "#3a1030", // magenta
      intensity: 0.9,
    });
    scene.add(nebula);
    animatedMaterials.push(nebula.material as THREE.ShaderMaterial);
  }

  // Star field
  const stars = createStarField(4000, 8000);
  stars.visible = style.starField;
  scene.add(stars);
  animatedMaterials.push(stars.material as THREE.ShaderMaterial);

  // A touch more exposure so the planetary glow and stars carry the scene.
  if (isDark) renderer.toneMappingExposure = 1.32;

  // Selection ring
  const selectionRing = createSelectionRing();
  scene.add(selectionRing);

  // Labels
  const labels = createLabelSystem(style.maxLabels);
  scene.add(labels.group);

  // Keyboard controls — scoped to container (default: fly mode, matching original)
  const cameraMode = rendererConfig?.cameraMode ?? "fly";
  const keyboard = setupKeyboardControls(camera, controls, container, cameraMode, style.flySpeed ?? 1.0);

  // Custom scroll handler: linear zoom without acceleration/inertia.
  // Moves camera + target along look direction, proportional to scroll delta.
  // In 2D mode OrbitControls handles wheel + pinch itself (enableZoom).
  controls.enableZoom = false;
  const flags: SceneState["flags"] = {
    is2D: false,
    keyboardMode3D: cameraMode,
    rotateButton: null,
    panSpeedBase: 1,
  };
  const _wheelOffset = new THREE.Vector3();
  const onWheel = (e: WheelEvent) => {
    if (flags.is2D) return;
    e.preventDefault();
    let delta = -e.deltaY;
    if (e.deltaMode === 1) delta *= 40;   // line → pixels
    if (e.deltaMode === 2) delta *= 800;  // page → pixels
    // Dolly toward the orbit target WITHOUT moving it — the target is the
    // rotation pivot and must stay on what the user is looking at
    // (dragging it through the scene made later rotations swing wildly).
    const target = controls.target as THREE.Vector3;
    _wheelOffset.copy(camera.position).sub(target);
    const dist = _wheelOffset.length();
    const moveAmount = delta * 0.002 * Math.max(dist * 0.1, 1);
    const newDist = Math.min(
      Math.max(dist - moveAmount, controls.minDistance),
      controls.maxDistance
    );
    _wheelOffset.setLength(newDist);
    camera.position.copy(target).add(_wheelOffset);
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // Trackball rotation: screen-relative axes through the orbit target.
  // OrbitControls always yaws around world-Y, which feels wrong once the
  // view is tilted — the rotation axes must come from the CURRENT view.
  const trackballCleanup = setupTrackballRotation(canvas, camera, controls, flags);
  const scrollCleanup = () => {
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dragstart", onDragStart);
    canvas.removeEventListener("selectstart", onSelectStart);
    trackballCleanup();
  };

  return {
    scene,
    camera,
    renderer,
    controls,
    stars,
    nebula,
    animatedMaterials,
    selectionRing,
    labels,
    composer: null,
    bloomPass: null,
    keyboard,
    scrollCleanup,
    flags,
  };
}

/** Radians of rotation per pixel of pointer travel */
const TRACKBALL_SPEED = 0.004;

/**
 * Screen-relative (trackball) rotation around the orbit target.
 * Horizontal drag spins around the camera's up axis, vertical drag
 * around its right axis — the axes are rebuilt from the current view
 * every move, so rotation always matches what the user sees.
 */
function setupTrackballRotation(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  flags: SceneState["flags"]
): () => void {
  let rotating = false;
  let lastX = 0;
  let lastY = 0;
  const _offset = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _upAxis = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _qPitch = new THREE.Quaternion();

  function onDown(e: PointerEvent) {
    if (flags.rotateButton == null || e.button !== flags.rotateButton) return;
    rotating = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
  }

  function onMove(e: PointerEvent) {
    if (!rotating) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (!dx && !dy) return;

    const target = controls.target as THREE.Vector3;
    _offset.copy(camera.position).sub(target);
    _right.setFromMatrixColumn(camera.matrix, 0);
    _upAxis.setFromMatrixColumn(camera.matrix, 1);
    _q.setFromAxisAngle(_upAxis, -dx * TRACKBALL_SPEED);
    _qPitch.setFromAxisAngle(_right, -dy * TRACKBALL_SPEED);
    _q.multiply(_qPitch);
    _offset.applyQuaternion(_q);
    camera.up.applyQuaternion(_q).normalize();
    camera.position.copy(target).add(_offset);
    camera.lookAt(target);
  }

  function onUp(e: PointerEvent) {
    if (!rotating) return;
    rotating = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}

/**
 * Apply the navigation scheme for the current layout dimensionality,
 * honouring per-consumer overrides. Defaults — 3D: left=rotate,
 * right=pan, keyboard=cameraMode; 2D: left=pan, right=rotate,
 * keyboard="pan" (and the camera snaps to face the z=0 plane head-on).
 */
export function applyNavigationMode(
  state: SceneState,
  is2D: boolean,
  nav?: NavigationConfig
): void {
  const { controls, camera, keyboard } = state;
  state.flags.is2D = is2D;

  const left = nav?.leftButton ?? (is2D ? "pan" : "rotate");
  const right = nav?.rightButton ?? (is2D ? "rotate" : "pan");
  // Rotation is handled by the screen-relative trackball handler — the
  // rotate button maps to NONE in OrbitControls so only pan/dolly remain.
  const NONE = -1 as unknown as THREE.MOUSE;
  controls.mouseButtons = {
    LEFT: left === "pan" ? THREE.MOUSE.PAN : NONE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: right === "pan" ? THREE.MOUSE.PAN : NONE,
  };
  controls.enableRotate = false;
  state.flags.rotateButton =
    left === "rotate" ? 0 : right === "rotate" ? 2 : null;
  controls.touches =
    left === "pan"
      ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
      : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  // 2D uses OrbitControls dolly (wheel + pinch); 3D keeps the custom
  // linear wheel handler registered in createScene.
  controls.enableZoom = is2D;
  controls.screenSpacePanning = true;

  state.flags.panSpeedBase = nav?.panSpeed ?? 1;
  controls.panSpeed = state.flags.panSpeedBase;

  const kb = nav?.keyboard ?? (is2D ? "pan" : state.flags.keyboardMode3D);
  if (kb === "off") {
    keyboard.setEnabled(false);
  } else {
    keyboard.setEnabled(true);
    keyboard.setMode(kb);
  }

  if (is2D) {
    // Snap to a head-on view of the plane, keeping the current distance
    const t = controls.target as THREE.Vector3;
    const dist = Math.max(camera.position.distanceTo(t), 50);
    t.z = 0;
    camera.up.set(0, 1, 0);
    camera.position.set(t.x, t.y, dist);
    camera.lookAt(t);
  }
  controls.update();
}

/** Initialize bloom post-processing */
export function initBloom(
  state: SceneState,
  nodeCount: number,
  style: Required<StyleConfig>
): void {
  if (state.composer) return;
  try {
    const { renderer, scene, camera } = state;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomRes = nodeCount > 30000 ? 3 : nodeCount > 10000 ? 2 : 1.5;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(
        renderer.domElement.width / bloomRes,
        renderer.domElement.height / bloomRes
      ),
      style.bloomStrength,
      style.bloomRadius,
      style.bloomThreshold
    );
    composer.addPass(bloom);
    state.composer = composer;
    state.bloomPass = bloom;
  } catch (_) {
    // Bloom not supported — fallback to regular render
  }
}

/** Start the animation loop, returns cancel function */
export function startAnimationLoop(
  state: SceneState,
  onTick?: () => void
): () => void {
  let animFrame: number;
  let wasKeyboardActive = false;
  const _syncDir = new THREE.Vector3();
  const clock = new THREE.Clock();

  function animate() {
    animFrame = requestAnimationFrame(animate);

    // Drive time-based shaders (planet spin, star twinkle, nebula drift).
    const elapsed = clock.getElapsedTime();
    for (let i = 0; i < state.animatedMaterials.length; i++) {
      const u = state.animatedMaterials[i].uniforms;
      if (u && u.uTime) u.uTime.value = elapsed;
    }

    // When keyboard is driving camera, skip OrbitControls.update()
    // to prevent its polar angle clamping from overriding our rotation
    const keyboardActive = state.keyboard.update();

    // When keyboard navigation just stopped, sync OrbitControls to
    // current camera state so the view doesn't snap back.
    if (wasKeyboardActive && !keyboardActive) {
      const dist = state.camera.position.distanceTo(
        state.controls.target as THREE.Vector3
      );
      state.camera.getWorldDirection(_syncDir);
      (state.controls.target as THREE.Vector3)
        .copy(state.camera.position)
        .add(_syncDir.multiplyScalar(dist));
      // Reset up to world-Y so OrbitControls works correctly
      state.camera.up.set(0, 1, 0);
      state.camera.lookAt(state.controls.target as THREE.Vector3);
    }
    wasKeyboardActive = keyboardActive;

    if (!keyboardActive) state.controls.update();

    if (state.selectionRing.visible) {
      state.selectionRing.quaternion.copy(state.camera.quaternion);
    }

    onTick?.();

    if (state.composer) {
      state.composer.render();
    } else {
      state.renderer.render(state.scene, state.camera);
    }
  }
  animate();

  return () => cancelAnimationFrame(animFrame);
}

/** Set up resize observer for the container */
export function setupResize(
  container: HTMLElement,
  state: SceneState
): ResizeObserver {
  const observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width === 0 || height === 0) return;
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
    if (state.composer) state.composer.setSize(width, height);
  });
  observer.observe(container);
  return observer;
}
