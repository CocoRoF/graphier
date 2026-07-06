/**
 * "Paper" theme — light background for embedding in light-mode UIs.
 * Saturated node colors that hold up on white; normal (non-additive)
 * edge blending so lines stay visible. Pair with
 * `style={{ starField: false, bloomStrength: 0, fogDensity: 0 }}`.
 */

import type { ThemeConfig } from "../types";

export const paper: ThemeConfig = {
  nodeColors: {},
  // Bright (label / highlight) colors are auto-derived: on a light
  // background resolveTheme darkens instead of whitening.
  nodeColorsBright: {},
  linkColors: {},
  defaultNodeColor: "#64748b",
  defaultLinkColor: "#b3bdcc",
  backgroundColor: "#f6f7f9",
  blending: "normal",
  palette: [
    "#2563eb", // blue
    "#d97706", // amber
    "#7c3aed", // violet
    "#db2777", // pink
    "#0891b2", // cyan
    "#16a34a", // green
    "#dc2626", // red
    "#475569", // slate
  ],
};
