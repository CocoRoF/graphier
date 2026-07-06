/**
 * Theme resolution — resolves user theme config into concrete color lookups.
 * Handles auto-assignment from palette for unmapped types.
 */

import type { ThemeConfig } from "../types";
import { brighten, darken, luminance, DEFAULT_PALETTE } from "../utils/color";
import { celestial } from "./celestial";
import { neon } from "./neon";
import { minimal } from "./minimal";
import { paper } from "./paper";

export interface ResolvedTheme {
  nodeColor(type?: string): string;
  nodeColorBright(type?: string): string;
  linkColor(type?: string): string;
  backgroundColor: string;
  /** True when the background is light — flips highlight/dim direction */
  isLight: boolean;
  /** Whether edges should use additive blending (dark backgrounds only) */
  additiveEdges: boolean;
}

const PRESETS: Record<string, ThemeConfig> = {
  celestial,
  neon,
  minimal,
  paper,
};

const DEFAULT_THEME = {
  nodeColors: celestial.nodeColors ?? {},
  nodeColorsBright: celestial.nodeColorsBright ?? {},
  linkColors: celestial.linkColors ?? {},
  defaultNodeColor: celestial.defaultNodeColor ?? "#8b949e",
  defaultLinkColor: celestial.defaultLinkColor ?? "#8b949e",
  backgroundColor: celestial.backgroundColor ?? "#030810",
  palette: DEFAULT_PALETTE,
};

export function resolveTheme(
  theme?: ThemeConfig | string
): ResolvedTheme {
  let config: ThemeConfig;
  if (typeof theme === "string") {
    config = PRESETS[theme] ?? celestial;
  } else {
    config = theme ?? {};
  }

  const nodeColors = { ...DEFAULT_THEME.nodeColors, ...config.nodeColors };
  const nodeColorsBright = {
    ...DEFAULT_THEME.nodeColorsBright,
    ...config.nodeColorsBright,
  };
  const linkColors = { ...DEFAULT_THEME.linkColors, ...config.linkColors };
  const defaultNodeColor =
    config.defaultNodeColor ?? DEFAULT_THEME.defaultNodeColor;
  const defaultLinkColor =
    config.defaultLinkColor ?? DEFAULT_THEME.defaultLinkColor;
  const backgroundColor =
    config.backgroundColor ?? DEFAULT_THEME.backgroundColor;
  const palette = config.palette ?? DEFAULT_THEME.palette;
  const isLight = luminance(backgroundColor) > 0.5;
  const additiveEdges = config.blending
    ? config.blending === "additive"
    : !isLight;

  // Track auto-assigned colors for unmapped types
  const autoAssigned = new Map<string, number>();
  let nextPaletteIdx = 0;

  function nodeColor(type?: string): string {
    if (!type) return defaultNodeColor;
    if (nodeColors[type]) return nodeColors[type];
    if (!autoAssigned.has(type)) {
      autoAssigned.set(type, nextPaletteIdx);
      nextPaletteIdx = (nextPaletteIdx + 1) % palette.length;
    }
    return palette[autoAssigned.get(type)!];
  }

  // On light backgrounds "bright" must darken/saturate — whitened
  // colors wash out against white (labels, hop-1 highlight, ring).
  const emphasize = (c: string) => (isLight ? darken(c, 0.72) : brighten(c, 1.5));

  function nodeColorBright(type?: string): string {
    if (!type) return emphasize(defaultNodeColor);
    if (nodeColorsBright[type]) return nodeColorsBright[type];
    return emphasize(nodeColor(type));
  }

  function linkColor(type?: string): string {
    if (!type) return defaultLinkColor;
    return linkColors[type] ?? defaultLinkColor;
  }

  return {
    nodeColor,
    nodeColorBright,
    linkColor,
    backgroundColor,
    isLight,
    additiveEdges,
  };
}
