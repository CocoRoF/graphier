/**
 * "Celestial" theme — the original GitHub AI Network visual style.
 * Dark space background with glowing nodes and bloom effects.
 */

import type { ThemeConfig } from "../types";

export const celestial: ThemeConfig = {
  nodeColors: {
    author: "#58a6ff",
    repo: "#3fb950",
    topic: "#d29922",
  },
  nodeColorsBright: {
    author: "#9dcfff",
    repo: "#7ee89a",
    topic: "#f0c45a",
  },
  linkColors: {
    owns: "#58a6ff",
    contributes: "#8b949e",
    has_topic: "#d29922",
    coworker: "#da70d6",
    forked_from: "#8888cc",
  },
  defaultNodeColor: "#8b949e",
  defaultLinkColor: "#8b949e",
  backgroundColor: "#030810",
  // Planet hues for auto-assigned (unmapped) node types — a spread of stellar
  // temperatures so a graph of mixed types reads like a varied star system.
  palette: [
    "#4c9fff", // azure
    "#f5b43a", // amber
    "#a371f7", // violet
    "#ff5c8a", // rose
    "#2dd4bf", // teal
    "#ff6b4a", // ember
    "#46d160", // green
    "#8b95d4", // pale indigo
  ],
};
