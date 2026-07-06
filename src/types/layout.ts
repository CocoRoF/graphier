/**
 * Layout engine configuration.
 */

export interface LayoutConfig {
  /** Layout algorithm (currently only "force-3d") */
  type?: "force-3d";
  /** Many-body charge strength — "auto" adapts to graph size, or provide a number (default: "auto") */
  charge?: "auto" | number;
  /** Link distance — "auto" adapts to graph size, or provide a number (default: "auto") */
  linkDistance?: "auto" | number;
  /** Alpha decay rate — "auto" adapts to graph size (default: "auto") */
  alphaDecay?: "auto" | number;
  /** Velocity damping 0..1 (default: 0.4) */
  velocityDecay?: number;
  /** Convergence threshold — simulation stops when alpha drops below this (default: 0.005) */
  settledThreshold?: number;
  /**
   * Spread multiplier — scales charge strength and link distance to control
   * how far apart nodes spread. 1.0 = default, 2.0 = twice as spread out.
   * Automatically scaled by node count when set to "auto".
   * (default: "auto")
   */
  spreadFactor?: "auto" | number;
  /**
   * Layout dimensionality (default: 3).
   * 2 = flat Obsidian-style plane: the simulation runs in 2D (z is locked
   * to 0), the camera is locked to pan/zoom (no rotation), and dragging
   * stays on the plane.
   */
  dimensions?: 2 | 3;
  /**
   * Pull nodes that share the same key toward a common centroid so
   * categories form visible clusters ("type" reads node.type, "group"
   * reads node.group). null/undefined = off (default).
   */
  clusterBy?: "type" | "group" | null;
  /** Cluster attraction strength 0..1 (default: 0.05). */
  clusterStrength?: number;
}

export const DEFAULT_LAYOUT: Required<LayoutConfig> = {
  type: "force-3d",
  charge: "auto",
  linkDistance: "auto",
  alphaDecay: "auto",
  velocityDecay: 0.4,
  settledThreshold: 0.005,
  spreadFactor: "auto",
  dimensions: 3,
  clusterBy: null,
  clusterStrength: 0.05,
};
