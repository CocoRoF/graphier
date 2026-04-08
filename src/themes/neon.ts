/**
 * "Neon" theme — vibrant neon colors on pure black.
 */

import type { ThemeConfig } from "../types";

export const neon: ThemeConfig = {
  nodeColors: {
    primary: "#00ff87",
    secondary: "#f72585",
    tertiary: "#7209b7",
  },
  linkColors: {
    default: "#4cc9f0",
    strong: "#f72585",
    weak: "#3a0ca3",
  },
  defaultNodeColor: "#4cc9f0",
  defaultLinkColor: "#4361ee",
  backgroundColor: "#000000",
};
