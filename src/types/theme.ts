/**
 * Theme configuration — controls all visual appearance.
 */

export interface ThemeConfig {
  /** Node colors by type string (e.g. { person: "#58a6ff", repo: "#3fb950" }) */
  nodeColors?: Record<string, string>;
  /** Brighter node colors for highlights (auto-generated if omitted) */
  nodeColorsBright?: Record<string, string>;
  /** Edge colors by type string (e.g. { follows: "#8b949e" }) */
  linkColors?: Record<string, string>;
  /** Fallback color for unmapped node types */
  defaultNodeColor?: string;
  /** Fallback color for unmapped link types */
  defaultLinkColor?: string;
  /** Scene background color */
  backgroundColor?: string;
  /** Color palette for auto-assignment when type has no explicit mapping */
  palette?: string[];
}

export interface StyleConfig {
  /** Minimum node sphere radius (default: 1) */
  nodeMinSize?: number;
  /** Maximum node sphere radius (default: 15) */
  nodeMaxSize?: number;
  /** Edge line opacity 0..1 (default: 0.15) */
  edgeOpacity?: number;
  /** Bloom glow strength (default: 0.6) */
  bloomStrength?: number;
  /** Bloom glow radius (default: 0.1) */
  bloomRadius?: number;
  /** Bloom brightness threshold (default: 0.1) */
  bloomThreshold?: number;
  /** Show background star field (default: true) */
  starField?: boolean;
  /** Exponential fog density (default: 0.0006, 0 = disabled) */
  fogDensity?: number;
  /** Auto-orbit camera rotation (default: false) */
  autoOrbit?: boolean;
  /** Label text scale multiplier (default: 1.0) */
  labelScale?: number;
  /** Label visibility distance threshold 0..1 (default: 0.8) */
  labelThreshold?: number;
  /** Show labels at all (default: true) */
  showLabels?: boolean;
  /** Maximum visible labels at once (default: 150) */
  maxLabels?: number;
  /** Edge line width multiplier (default: 1.0). Note: WebGL limits linewidth to 1 on most platforms. */
  edgeWidthScale?: number;
  /**
   * Fly camera thrust speed multiplier (default: 1.0).
   * 0.5 = half speed, 2.0 = double speed.
   */
  flySpeed?: number;
}

export const DEFAULT_STYLE: Required<StyleConfig> = {
  nodeMinSize: 1,
  nodeMaxSize: 15,
  edgeOpacity: 0.15,
  bloomStrength: 0.6,
  bloomRadius: 0.1,
  bloomThreshold: 0.1,
  starField: true,
  fogDensity: 0.0006,
  autoOrbit: false,
  labelScale: 1.0,
  labelThreshold: 0.8,
  showLabels: true,
  maxLabels: 150,
  edgeWidthScale: 1.0,
  flySpeed: 1.0,
};
