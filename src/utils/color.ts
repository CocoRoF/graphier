/**
 * Color utility functions for theme resolution.
 */

/** Parse hex color to RGB components (0-1 range) */
export function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const n = parseInt(c, 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** Convert RGB components (0-1 range) to hex string */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const hex = (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
  return "#" + hex.toString(16).padStart(6, "0");
}

/** Brighten a hex color by a factor (1.0 = no change, 1.5 = 50% brighter) */
export function brighten(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  // Lerp toward white
  const t = 1 - 1 / factor;
  return rgbToHex(r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t);
}

/** Dim a hex color by a scalar multiplier */
export function dim(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

/**
 * Default palette for auto-assigning colors to unmapped types.
 * Visually distinct, optimized for dark backgrounds.
 */
export const DEFAULT_PALETTE: string[] = [
  "#58a6ff", // blue
  "#3fb950", // green
  "#d29922", // orange
  "#da70d6", // orchid
  "#f97583", // pink-red
  "#56d4dd", // cyan
  "#d2a8ff", // lavender
  "#ffa657", // amber
  "#7ee89a", // mint
  "#ff7b72", // coral
  "#79c0ff", // sky
  "#e3b341", // gold
];
