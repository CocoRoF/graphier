/**
 * Renderer and ref API types.
 */

import type * as THREE from "three";
import type { GraphNode, GraphLink } from "./graph";

export interface RendererConfig {
  /** WebGL antialiasing (default: false for performance) */
  antialias?: boolean;
  /** Max device pixel ratio (default: 1.5) */
  pixelRatioMax?: number;
  /**
   * Camera control mode:
   * - "fly" (default): WASD/arrow thrust-based flight with inertia (matches original)
   * - "orbit": z/x zoom, arrow keys orbit around target
   */
  cameraMode?: "fly" | "orbit";
  /**
   * Pointer/keyboard navigation overrides. Defaults depend on layout
   * dimensionality — 3D: left=rotate, right=pan, keyboard=cameraMode;
   * 2D: left=pan, right=rotate, keyboard="pan".
   */
  navigation?: NavigationConfig;
}

export interface NavigationConfig {
  /** What left-drag does (default: "rotate" in 3D, "pan" in 2D) */
  leftButton?: "rotate" | "pan";
  /** What right-drag does (default: "pan" in 3D, "rotate" in 2D) */
  rightButton?: "rotate" | "pan";
  /**
   * Keyboard scheme — "pan": arrows/WASD pan + z/x zoom; "fly": thrust
   * flight; "orbit": orbit around target; "off": disabled.
   * (default: cameraMode in 3D, "pan" in 2D)
   */
  keyboard?: "fly" | "orbit" | "pan" | "off";
  /**
   * Base drag-pan speed multiplier (default: 1 = cursor-accurate at the
   * orbit-target depth). On top of this, pan automatically accelerates
   * up to 3x as the camera zooms deep into the graph — otherwise
   * traversing a large graph while zoomed in takes dozens of drags.
   */
  panSpeed?: number;
}

/** Raw per-frame node buffers for lightweight overlays (e.g. minimap) */
export interface GraphSnapshot {
  /** xyz triplets, one per node (live buffer — do not mutate) */
  positions: Float32Array;
  /** Node count */
  count: number;
  /** rgb triplets per node from the instanced mesh (live buffer) */
  colors: Float32Array | null;
  /** 1 = hidden by the visibility filter (live buffer) */
  hidden: Uint8Array | null;
  /** Index of the selected node, -1 if none */
  selectedIndex: number;
}

/** Camera frustum footprint on the z=0 plane (world units) */
export interface ViewportRect {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

export interface NetworkGraph3DRef {
  /** Animate camera to position, looking at target */
  cameraPosition(
    pos: { x: number; y: number; z: number },
    lookAt: { x: number; y: number; z: number },
    duration?: number
  ): void;
  /** Zoom to fit all nodes in view */
  zoomToFit(duration?: number, padding?: number): void;
  /** Zoom in toward center */
  zoomIn(): void;
  /** Zoom out from center */
  zoomOut(): void;
  /** Focus camera on a specific node */
  focusNode(nodeId: string, duration?: number): void;
  /**
   * Incrementally add nodes and links without full rebuild.
   * Existing node positions are preserved; new nodes spawn near their neighbors.
   * Returns the number of new nodes actually added (deduped by ID).
   */
  appendData(nodes: GraphNode[], links: GraphLink[]): number;
  /** Access the Three.js scene */
  getScene(): THREE.Scene | null;
  /** Access the Three.js renderer */
  getRenderer(): THREE.WebGLRenderer | null;
  /** Access the Three.js camera */
  getCamera(): THREE.PerspectiveCamera | null;
  /** Capture a screenshot as a PNG data URL string (synchronous, matches original) */
  captureScreenshot(): string | null;
  /** Re-run force layout from current positions (useful after changing spreadFactor) */
  reheatLayout(): void;
  /** Pan the camera to world (x, y), keeping the current zoom (2D-friendly) */
  panTo(x: number, y: number, duration?: number): void;
  /** Node position/color/visibility buffers for overlays like GraphMinimap */
  getGraphSnapshot(): GraphSnapshot | null;
  /** Current camera footprint on the z=0 plane (meaningful in 2D mode) */
  getViewportRect(): ViewportRect | null;
}
