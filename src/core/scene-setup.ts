/**
 * Three.js scene initialization: scene, camera, renderer, controls, post-processing.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { NavigationConfig, RendererConfig, StyleConfig } from "../types";
import { createStarField } from "./effects";
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
  selectionRing: THREE.Group;
  labels: LabelState;
  composer: EffectComposer | null;
  bloomPass: UnrealBloomPass | null;
  keyboard: KeyboardControlState;
  scrollCleanup: () => void;
  /** Mutable runtime flags shared with input handlers */
  flags: { is2D: boolean; keyboardMode3D: "fly" | "orbit" };
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

  // Ambient light
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  // Star field
  const stars = createStarField(4000, 8000);
  stars.visible = style.starField;
  scene.add(stars);

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
  const flags: { is2D: boolean; keyboardMode3D: "fly" | "orbit" } = {
    is2D: false,
    keyboardMode3D: cameraMode,
  };
  const _wheelDir = new THREE.Vector3();
  const onWheel = (e: WheelEvent) => {
    if (flags.is2D) return;
    e.preventDefault();
    let delta = -e.deltaY;
    if (e.deltaMode === 1) delta *= 40;   // line → pixels
    if (e.deltaMode === 2) delta *= 800;  // page → pixels
    camera.getWorldDirection(_wheelDir);
    const dist = camera.position.distanceTo(controls.target as THREE.Vector3);
    const moveAmount = delta * 0.002 * Math.max(dist * 0.1, 1);
    camera.position.addScaledVector(_wheelDir, moveAmount);
    (controls.target as THREE.Vector3).addScaledVector(_wheelDir, moveAmount);
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const scrollCleanup = () => {
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dragstart", onDragStart);
    canvas.removeEventListener("selectstart", onSelectStart);
  };

  return {
    scene,
    camera,
    renderer,
    controls,
    stars,
    selectionRing,
    labels,
    composer: null,
    bloomPass: null,
    keyboard,
    scrollCleanup,
    flags,
  };
}

const MOUSE_ACTION = {
  rotate: THREE.MOUSE.ROTATE,
  pan: THREE.MOUSE.PAN,
} as const;

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
  controls.mouseButtons = {
    LEFT: MOUSE_ACTION[left],
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: MOUSE_ACTION[right],
  };
  controls.enableRotate = left === "rotate" || right === "rotate";
  controls.touches =
    left === "pan"
      ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
      : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  // 2D uses OrbitControls dolly (wheel + pinch); 3D keeps the custom
  // linear wheel handler registered in createScene.
  controls.enableZoom = is2D;
  controls.screenSpacePanning = is2D;

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

  function animate() {
    animFrame = requestAnimationFrame(animate);
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
