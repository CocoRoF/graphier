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
  /**
   * What to do with positions already on the nodes (node.x / node.y / node.z):
   *   "ignore" (default): lay out from scratch,
   *   "seed": start from them and only tidy up (use with a low initialAlpha),
   *   "pin": keep them exactly; only nodes without a position are simulated.
   *            If every node has one, no simulation runs at all.
   * Positions kept from a previous render of the same node id still win.
   */
  preset?: "ignore" | "seed" | "pin";
  /** Starting simulation energy 0..1 (default: 1). 0.2–0.3 keeps a seeded layout recognizable. */
  initialAlpha?: number;
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
  preset: "ignore",
  initialAlpha: 1,
};
