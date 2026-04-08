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
}
