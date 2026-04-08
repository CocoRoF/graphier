/**
 * User interaction: raycasting for click/double-click on instanced nodes.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode } from "../types";
import { animateCamera } from "./camera";

export interface InteractionCallbacks {
  onNodeClick: (node: GraphNode | null) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
}

export interface InteractionState {
  cleanup: () => void;
}

/**
 * Set up click/double-click interaction on the graph canvas.
 * The container element receives focus on interaction so that
 * keyboard controls (scoped to the container) work correctly.
 * Returns a cleanup function to remove event listeners.
 */
export function setupInteraction(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  getNodesMesh: () => THREE.InstancedMesh | null,
  getNodes: () => GraphNode[],
  callbacks: InteractionCallbacks,
  container?: HTMLElement
): InteractionState {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let mouseDownPos: { x: number; y: number } | null = null;
  let lastClickTime = 0;
  let lastClickNodeId: string | null = null;
  let singleClickTimer: ReturnType<typeof setTimeout> | null = null;

  function onPointerDown(e: PointerEvent) {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    // Focus the container so keyboard controls (scoped to it) become active
    if (container && document.activeElement !== container) {
      container.focus({ preventScroll: true });
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!mouseDownPos) return;
    const dx = Math.abs(e.clientX - mouseDownPos.x);
    const dy = Math.abs(e.clientY - mouseDownPos.y);
    mouseDownPos = null;
    if (dx + dy > 5) return; // was a drag

    const nodesMesh = getNodesMesh();
    if (!nodesMesh) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObject(nodesMesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const nodes = getNodes();
      const node = nodes[hits[0].instanceId];
      if (!node) return;

      const now = performance.now();
      const isDouble =
        now - lastClickTime < 400 && lastClickNodeId === node.id;

      if (isDouble) {
        if (singleClickTimer) clearTimeout(singleClickTimer);
        singleClickTimer = null;
        lastClickTime = 0;
        lastClickNodeId = null;
        callbacks.onNodeDoubleClick?.(node);
        return;
      }

      lastClickTime = now;
      lastClickNodeId = node.id;

      singleClickTimer = setTimeout(() => {
        singleClickTimer = null;
        // Animate camera toward node
        const nx = (node as any).x ?? 0;
        const ny = (node as any).y ?? 0;
        const nz = (node as any).z ?? 0;
        const dist = Math.hypot(nx, ny, nz);
        if (dist > 1) {
          const ratio = 1 + 120 / dist;
          animateCamera(
            camera,
            controls,
            { x: nx * ratio, y: ny * ratio, z: nz * ratio },
            { x: nx, y: ny, z: nz },
            1200
          );
        }
        callbacks.onNodeClick(node);
      }, 250);
    } else {
      if (singleClickTimer) clearTimeout(singleClickTimer);
      singleClickTimer = null;
      lastClickTime = 0;
      lastClickNodeId = null;
      callbacks.onNodeClick(null);
    }
  }

  // Escape to deselect — scoped to container (or window fallback)
  const keyTarget: EventTarget = container ?? window;
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") callbacks.onNodeClick(null);
  }

  // Hover raycasting
  let lastHoveredId: string | null = null;
  function onPointerMove(e: PointerEvent) {
    if (!callbacks.onNodeHover) return;
    const nodesMesh = getNodesMesh();
    if (!nodesMesh) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObject(nodesMesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const nodes = getNodes();
      const node = nodes[hits[0].instanceId];
      if (node && node.id !== lastHoveredId) {
        lastHoveredId = node.id;
        canvas.style.cursor = "pointer";
        callbacks.onNodeHover(node);
      }
    } else if (lastHoveredId !== null) {
      lastHoveredId = null;
      canvas.style.cursor = "default";
      callbacks.onNodeHover(null);
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  keyTarget.addEventListener("keydown", onKeyDown as EventListener);

  return {
    cleanup: () => {
      if (singleClickTimer) clearTimeout(singleClickTimer);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      keyTarget.removeEventListener("keydown", onKeyDown as EventListener);
    },
  };
}
