/**
 * Network density computation.
 */

/** Compute graph density: 2|E| / (|N| * (|N| - 1)) for undirected graphs */
export function computeDensity(nodeCount: number, linkCount: number): number {
  if (nodeCount <= 1) return 0;
  return (2 * linkCount) / (nodeCount * (nodeCount - 1));
}
