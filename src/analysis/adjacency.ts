/**
 * Adjacency list construction and N-hop neighbor search.
 */
import type { GraphLink } from "../types";

/** Build an adjacency map from a list of links */
export function buildAdjacencyMap(
  links: GraphLink[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
    const t = typeof l.target === "object" ? (l.target as any).id : l.target;
    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    adj.get(s)!.push(t);
    adj.get(t)!.push(s);
  }
  return adj;
}

/**
 * Find all nodes within N hops of a root node.
 * Returns a Map of node ID → hop distance.
 */
export function getNeighbors(
  adjacencyMap: Map<string, string[]>,
  rootId: string,
  maxHops: number
): Map<string, number> {
  const visited = new Map<string, number>();
  visited.set(rootId, 0);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dist = visited.get(current)!;
    if (dist >= maxHops) continue;
    for (const nb of adjacencyMap.get(current) ?? []) {
      if (!visited.has(nb)) {
        visited.set(nb, dist + 1);
        queue.push(nb);
      }
    }
  }
  return visited;
}
