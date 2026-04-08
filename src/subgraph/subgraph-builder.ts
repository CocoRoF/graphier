/**
 * Subgraph extraction via BFS with budget-based node pruning.
 */
import type { GraphData, GraphNode, GraphLink } from "../types";

export interface SubgraphResult {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Map of node ID → hop distance from center */
  hops: Map<string, number>;
}

export interface SubgraphOptions {
  maxHops?: number;
  maxNodes?: number;
}

/**
 * Build a subgraph of N-hop neighborhood around a center node.
 * Uses budget-based pruning: all hop 0-1 nodes are kept,
 * then top nodes by `val` for remaining hops.
 */
export function buildSubgraph(
  data: GraphData,
  centerNodeId: string,
  adjacencyMap: Map<string, string[]>,
  options?: SubgraphOptions
): SubgraphResult {
  const maxHops = options?.maxHops ?? 3;
  const maxNodes = options?.maxNodes ?? 250;

  // BFS
  const visited = new Map<string, number>();
  visited.set(centerNodeId, 0);
  const queue = [centerNodeId];

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

  // Budget-based pruning
  if (visited.size > maxNodes) {
    const nodeMap = new Map<string, GraphNode>();
    for (const n of data.nodes) {
      if (visited.has(n.id)) nodeMap.set(n.id, n);
    }

    const kept = new Map<string, number>();
    for (const [id, hop] of visited) {
      if (hop <= 1) kept.set(id, hop);
    }

    const rest: { id: string; hop: number; val: number }[] = [];
    for (const [id, hop] of visited) {
      if (hop > 1) rest.push({ id, hop, val: nodeMap.get(id)?.val ?? 0 });
    }
    rest.sort((a, b) => b.val - a.val);

    const budget = maxNodes - kept.size;
    for (let i = 0; i < Math.min(budget, rest.length); i++) {
      kept.set(rest[i].id, rest[i].hop);
    }

    visited.clear();
    for (const [id, hop] of kept) visited.set(id, hop);
  }

  const subNodes = data.nodes.filter((n) => visited.has(n.id));
  const subLinks = data.links.filter((l) => {
    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
    const t = typeof l.target === "object" ? (l.target as any).id : l.target;
    return visited.has(s) && visited.has(t);
  });

  return { nodes: subNodes, links: subLinks, hops: visited };
}
