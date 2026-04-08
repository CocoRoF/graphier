/**
 * Degree computation: degree map, distribution stats.
 */
import type { GraphData, GraphNode } from "../types";

export interface DegreeMap {
  [nodeId: string]: number;
}

/** Compute degree for every node */
export function computeDegreeMap(data: GraphData): DegreeMap {
  const degree: DegreeMap = {};
  for (const n of data.nodes) degree[n.id] = 0;
  for (const l of data.links) {
    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
    const t = typeof l.target === "object" ? (l.target as any).id : l.target;
    if (degree[s] !== undefined) degree[s]++;
    if (degree[t] !== undefined) degree[t]++;
  }
  return degree;
}

export interface DegreeStats {
  min: number;
  max: number;
  avg: number;
  total: number;
}

/** Compute degree distribution statistics */
export function computeDegreeStats(degreeMap: DegreeMap): DegreeStats {
  const values = Object.values(degreeMap);
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, total: 0 };
  }
  const total = values.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: total / values.length,
    total,
  };
}

/** Get top N nodes by degree */
export function topByDegree(
  nodes: GraphNode[],
  degreeMap: DegreeMap,
  n: number
): Array<GraphNode & { degree: number }> {
  return nodes
    .map((node) => ({ ...node, degree: degreeMap[node.id] ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, n);
}
