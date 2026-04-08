/**
 * Adaptive layout parameters based on graph size.
 * Larger graphs need weaker forces and less frequent updates.
 */

import type { LayoutConfig } from "../types";

export interface ResolvedLayoutParams {
  charge: number;
  distanceMax: number;
  theta: number;
  linkDistance: number;
  alphaDecay: number;
  velocityDecay: number;
  settledThreshold: number;
  postEvery: number;
  initialRadius: number;
}

export function resolveLayoutParams(
  nodeCount: number,
  config?: LayoutConfig
): ResolvedLayoutParams {
  const n = nodeCount;

  const charge =
    config?.charge !== "auto" && config?.charge != null
      ? config.charge
      : n > 50000
        ? -80
        : n > 10000
          ? -120
          : -200;

  const distanceMax = n > 50000 ? 1500 : n > 10000 ? 2000 : 3000;
  const theta = n > 20000 ? 1.5 : n > 5000 ? 1.2 : 0.9;

  const linkDistance =
    config?.linkDistance !== "auto" && config?.linkDistance != null
      ? config.linkDistance
      : n > 50000
        ? 120
        : n > 10000
          ? 180
          : 250;

  const alphaDecay =
    config?.alphaDecay !== "auto" && config?.alphaDecay != null
      ? config.alphaDecay
      : n > 50000
        ? 0.04
        : n > 10000
          ? 0.03
          : 0.02;

  const velocityDecay = config?.velocityDecay ?? 0.4;
  const settledThreshold = config?.settledThreshold ?? 0.005;
  const postEvery = n > 50000 ? 5 : n > 10000 ? 3 : 2;
  const initialRadius = 500 + Math.min(n, 10000) * 0.1;

  return {
    charge,
    distanceMax,
    theta,
    linkDistance,
    alphaDecay,
    velocityDecay,
    settledThreshold,
    postEvery,
    initialRadius,
  };
}
