/**
 * User interaction: raycasting for click/double-click on instanced nodes,
 * context menu, edge hover/click, and node dragging.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode, GraphLink } from "../types";
import { animateCamera } from "./camera";

export interface InteractionCallbacks {
  onNodeClick: (node: GraphNode | null) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
  onContextMenu?: (node: GraphNode, position: { x: number; y: number }) => void;
  onLinkClick?: (link: GraphLink) => void;
  onLinkHover?: (link: GraphLink | null) => void;
  onNodeDrag?: (node: GraphNode, position: { x: number; y: number; z: number }) => void;
  onNodeDragEnd?: (node: GraphNode, position: { x: number; y: number; z: number }) => void;
}

export interface InteractionState {
  cleanup: () => void;
}

/** Screen-space distance threshold for edge hit testing */
const EDGE_HIT_THRESHOLD = 5;

/**
 * Set up click/double-click/context-menu/drag interaction on the graph canvas.
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
  container?: HTMLElement,
  getEdgeData?: () => {
    links: GraphLink[];
    edgeNodeIndices: [number, number][];
    edgeLinkIndices: number[];
    positions: Float32Array | null;
  } | null
): InteractionState {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let mouseDownPos: { x: number; y: number } | null = null;
  let lastClickTime = 0;
  let lastClickNodeId: string | null = null;
  let singleClickTimer: ReturnType<typeof setTimeout> | null = null;

  // Drag state
  let dragNode: GraphNode | null = null;
  let dragNodeIdx = -1;
  let isDragging = false;
  const dragPlane = new THREE.Plane();
  const dragIntersect = new THREE.Vector3();

  function onPointerDown(e: PointerEvent) {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    // Focus the container so keyboard controls (scoped to it) become active
    if (container && document.activeElement !== container) {
      container.focus({ preventScroll: true });
    }

    // Check for node hit for potential drag
    if (callbacks.onNodeDrag) {
      const nodesMesh = getNodesMesh();
      if (nodesMesh) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(nodesMesh);
        if (hits.length > 0 && hits[0].instanceId != null) {
          const nodes = getNodes();
          dragNode = nodes[hits[0].instanceId] ?? null;
          dragNodeIdx = hits[0].instanceId;
        }
      }
    }
  }

  function onPointerMove(e: PointerEvent) {
    // Node drag handling
    if (dragNode && mouseDownPos && callbacks.onNodeDrag) {
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      if (dx + dy > 5) {
        isDragging = true;
        controls.enabled = false;

        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Project onto plane perpendicular to camera at node position
        const nodePos = new THREE.Vector3(
          (dragNode as any).x ?? 0,
          (dragNode as any).y ?? 0,
          (dragNode as any).z ?? 0
        );
        dragPlane.setFromNormalAndCoplanarPoint(
          camera.getWorldDirection(new THREE.Vector3()).negate(),
          nodePos
        );
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
          callbacks.onNodeDrag(dragNode, {
            x: dragIntersect.x,
            y: dragIntersect.y,
            z: dragIntersect.z,
          });
        }
        return;
      }
    }

    // Hover raycasting (nodes)
    if (!callbacks.onNodeHover && !callbacks.onLinkHover) return;
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
        lastHoveredLinkIdx = -1;
        canvas.style.cursor = "pointer";
        callbacks.onNodeHover?.(node);
        callbacks.onLinkHover?.(null);
      }
    } else {
      if (lastHoveredId !== null) {
        lastHoveredId = null;
        canvas.style.cursor = "default";
        callbacks.onNodeHover?.(null);
      }

      // Edge hover if no node hit
      if (callbacks.onLinkHover && getEdgeData) {
        const edgeData = getEdgeData();
        if (edgeData?.positions) {
          const hitLink = findNearestEdge(
            e.clientX, e.clientY, rect, camera, edgeData as { links: GraphLink[]; edgeNodeIndices: [number, number][]; edgeLinkIndices: number[]; positions: Float32Array }
          );
          if (hitLink) {
            if (lastHoveredLinkIdx !== hitLink.index) {
              lastHoveredLinkIdx = hitLink.index;
              canvas.style.cursor = "pointer";
              callbacks.onLinkHover(hitLink.link);
            }
          } else if (lastHoveredLinkIdx !== -1) {
            lastHoveredLinkIdx = -1;
            canvas.style.cursor = "default";
            callbacks.onLinkHover(null);
          }
        }
      }
    }
  }

  function onPointerUp(e: PointerEvent) {
    // Handle drag end
    if (isDragging && dragNode && callbacks.onNodeDragEnd) {
      callbacks.onNodeDragEnd(dragNode, {
        x: (dragNode as any).x ?? 0,
        y: (dragNode as any).y ?? 0,
        z: (dragNode as any).z ?? 0,
      });
    }
    if (isDragging) {
      isDragging = false;
      dragNode = null;
      dragNodeIdx = -1;
      controls.enabled = true;
      mouseDownPos = null;
      return;
    }
    dragNode = null;
    dragNodeIdx = -1;

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
      // Check edge click before reporting background click
      if (callbacks.onLinkClick && getEdgeData) {
        const edgeData = getEdgeData();
        if (edgeData?.positions) {
          const hitLink = findNearestEdge(
            e.clientX, e.clientY, rect, camera, edgeData as { links: GraphLink[]; edgeNodeIndices: [number, number][]; edgeLinkIndices: number[]; positions: Float32Array }
          );
          if (hitLink) {
            callbacks.onLinkClick(hitLink.link);
            return;
          }
        }
      }

      if (singleClickTimer) clearTimeout(singleClickTimer);
      singleClickTimer = null;
      lastClickTime = 0;
      lastClickNodeId = null;
      callbacks.onNodeClick(null);
    }
  }

  // Context menu (right-click)
  function onContextMenu(e: MouseEvent) {
    if (!callbacks.onContextMenu) return;
    e.preventDefault();

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
      if (node) {
        callbacks.onContextMenu(node, { x: e.clientX, y: e.clientY });
      }
    }
  }

  // Escape to deselect — scoped to container (or window fallback)
  const keyTarget: EventTarget = container ?? window;
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") callbacks.onNodeClick(null);
  }

  let lastHoveredId: string | null = null;
  let lastHoveredLinkIdx = -1;

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("contextmenu", onContextMenu);
  keyTarget.addEventListener("keydown", onKeyDown as EventListener);

  return {
    cleanup: () => {
      if (singleClickTimer) clearTimeout(singleClickTimer);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      keyTarget.removeEventListener("keydown", onKeyDown as EventListener);
    },
  };
}

/** Find nearest edge to a screen-space point */
function findNearestEdge(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: THREE.PerspectiveCamera,
  edgeData: {
    links: GraphLink[];
    edgeNodeIndices: [number, number][];
    edgeLinkIndices: number[];
    positions: Float32Array;
  }
): { link: GraphLink; index: number } | null {
  const { links, edgeNodeIndices, edgeLinkIndices, positions } = edgeData;
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  let bestDist = EDGE_HIT_THRESHOLD;
  let bestIdx = -1;

  const tmpVec = new THREE.Vector3();

  for (let i = 0; i < edgeNodeIndices.length; i++) {
    const [si, ti] = edgeNodeIndices[i];

    // Project source and target to screen space
    tmpVec.set(positions[si * 3], positions[si * 3 + 1], positions[si * 3 + 2]);
    tmpVec.project(camera);
    const sx1 = (tmpVec.x * 0.5 + 0.5) * w;
    const sy1 = (-tmpVec.y * 0.5 + 0.5) * h;

    tmpVec.set(positions[ti * 3], positions[ti * 3 + 1], positions[ti * 3 + 2]);
    tmpVec.project(camera);
    const sx2 = (tmpVec.x * 0.5 + 0.5) * w;
    const sy2 = (-tmpVec.y * 0.5 + 0.5) * h;

    // Point-to-line-segment distance in screen space
    const dist = pointToSegmentDist(screenX, screenY, sx1, sy1, sx2, sy2);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) return null;
  return { link: links[edgeLinkIndices[bestIdx]], index: bestIdx };
}

/** Point-to-line-segment distance (2D) */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
