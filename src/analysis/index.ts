/**
 * Graph analysis module — tree-shakeable, no Three.js dependency.
 *
 * Usage:
 *   import { analyzeGraph, buildAdjacencyMap } from 'graphier/analysis';
 */
import type { GraphData, GraphNode } from "../types";
import { computeDegreeMap, computeDegreeStats, topByDegree } from "./degree";
import { computeDensity } from "./density";
import {
  computeLinkTypeBreakdown,
  groupByType,
} from "./centrality";
import { buildAdjacencyMap, getNeighbors } from "./adjacency";

export interface GraphAnalytics {
  nodeCount: number;
  linkCount: number;
  density: number;
  avgDegree: number;
  maxDegree: number;
  minDegree: number;
  totalDegree: number;
  degreeMap: Record<string, number>;
  nodesByType: Record<string, number>;
  linksByType: Record<string, number>;
  /** Get top N nodes by degree */
  topByDegree(n: number): Array<GraphNode & { degree: number }>;
}

/**
 * Analyze a graph and return comprehensive statistics.
 *
 * @example
 * ```ts
 * const stats = analyzeGraph(data);
 * console.log(`Density: ${stats.density}`);
 * console.log(`Top hubs:`, stats.topByDegree(10));
 * ```
 */
export function analyzeGraph(data: GraphData): GraphAnalytics {
  const degreeMap = computeDegreeMap(data);
  const degreeStats = computeDegreeStats(degreeMap);
  const density = computeDensity(data.nodes.length, data.links.length);
  const nodesByType = groupByType(data.nodes);
  const linksByType = computeLinkTypeBreakdown(data.links);

  return {
    nodeCount: data.nodes.length,
    linkCount: data.links.length,
    density,
    avgDegree: degreeStats.avg,
    maxDegree: degreeStats.max,
    minDegree: degreeStats.min,
    totalDegree: degreeStats.total,
    degreeMap,
    nodesByType,
    linksByType,
    topByDegree: (n: number) => topByDegree(data.nodes, degreeMap, n),
  };
}

// Re-export individual utilities
export { buildAdjacencyMap, getNeighbors } from "./adjacency";
export { computeDegreeMap, computeDegreeStats, topByDegree } from "./degree";
export { computeDensity } from "./density";
export {
  computeLinkTypeBreakdown,
  computeNodeLinkCounts,
  findHubs,
  groupByType,
} from "./centrality";
