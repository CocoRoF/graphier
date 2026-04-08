/**
 * Centrality and hub detection.
 */
import type { GraphData, GraphNode, GraphLink } from "../types";
import { computeDegreeMap, type DegreeMap } from "./degree";

export interface LinkTypeBreakdown {
  [linkType: string]: number;
}

/** Count links by type */
export function computeLinkTypeBreakdown(links: GraphLink[]): LinkTypeBreakdown {
  const counts: LinkTypeBreakdown = {};
  for (const l of links) {
    const type = l.type ?? "default";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

/** Count how many links of specific types each node has */
export function computeNodeLinkCounts(
  data: GraphData,
  linkTypes: string[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of data.nodes) counts.set(n.id, 0);

  const typeSet = new Set(linkTypes);
  for (const l of data.links) {
    if (!typeSet.has(l.type ?? "default")) continue;
    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
    const t = typeof l.target === "object" ? (l.target as any).id : l.target;
    if (counts.has(s)) counts.set(s, counts.get(s)! + 1);
    if (counts.has(t)) counts.set(t, counts.get(t)! + 1);
  }
  return counts;
}

/**
 * Find hub nodes — nodes with degree above a threshold.
 * Returns nodes sorted by degree descending.
 */
export function findHubs(
  nodes: GraphNode[],
  degreeMap: DegreeMap,
  minDegree: number
): Array<GraphNode & { degree: number }> {
  return nodes
    .map((n) => ({ ...n, degree: degreeMap[n.id] ?? 0 }))
    .filter((n) => n.degree >= minDegree)
    .sort((a, b) => b.degree - a.degree);
}

/** Group nodes by type with counts */
export function groupByType(
  nodes: GraphNode[]
): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const n of nodes) {
    const type = n.type ?? "default";
    groups[type] = (groups[type] ?? 0) + 1;
  }
  return groups;
}
