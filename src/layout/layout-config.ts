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

/**
 * Compute an automatic spread factor based on node count.
 * More nodes → more spread to prevent overcrowding.
 *   < 500:  1.0 (default)
 *   500-2k: 1.0–1.3
 *   2k-10k: 1.3–1.8
 *   10k+:   1.8–2.5
 */
function autoSpreadFactor(n: number): number {
  if (n <= 500) return 1.0;
  if (n <= 2000) return 1.0 + (n - 500) / 1500 * 0.3;
  if (n <= 10000) return 1.3 + (n - 2000) / 8000 * 0.5;
  return Math.min(2.5, 1.8 + (n - 10000) / 40000 * 0.7);
}

export function resolveLayoutParams(
  nodeCount: number,
  config?: LayoutConfig
): ResolvedLayoutParams {
  const n = nodeCount;

  // Resolve spread factor
  const spread =
    config?.spreadFactor !== "auto" && config?.spreadFactor != null
      ? config.spreadFactor
      : autoSpreadFactor(n);

  const baseCharge =
    config?.charge !== "auto" && config?.charge != null
      ? config.charge
      : n > 50000
        ? -80
        : n > 10000
          ? -120
          : -200;

  // Apply spread: stronger repulsion = more spread
  const charge = baseCharge * spread;

  const distanceMax = (n > 50000 ? 1500 : n > 10000 ? 2000 : 3000) * spread;
  const theta = n > 20000 ? 1.5 : n > 5000 ? 1.2 : 0.9;

  const baseLinkDistance =
    config?.linkDistance !== "auto" && config?.linkDistance != null
      ? config.linkDistance
      : n > 50000
        ? 120
        : n > 10000
          ? 180
          : 250;

  // Apply spread: longer links = more spread
  const linkDistance = baseLinkDistance * spread;

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
  const initialRadius = (500 + Math.min(n, 10000) * 0.1) * spread;

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
