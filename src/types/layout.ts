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
}

export const DEFAULT_LAYOUT: Required<LayoutConfig> = {
  type: "force-3d",
  charge: "auto",
  linkDistance: "auto",
  alphaDecay: "auto",
  velocityDecay: 0.4,
  settledThreshold: 0.005,
  spreadFactor: "auto",
};
