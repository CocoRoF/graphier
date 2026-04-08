/**
 * Core graph data types — domain-agnostic.
 * Users provide any `type` string ("person", "server", "repo", etc.)
 * and the theme system maps them to colors automatically.
 */

export interface GraphNode {
  /** Unique identifier */
  id: string;
  /** Node category — maps to theme colors (e.g. "person", "repo") */
  type?: string;
  /** Display label (falls back to id) */
  label?: string;
  /** Size weight — higher values render larger (default: 1) */
  val?: number;
  /** Grouping key for color auto-assignment (alternative to type) */
  group?: string;
  /** User-defined extra data (accessible in callbacks) */
  [key: string]: unknown;
}

export interface GraphLink {
  /** Source node id */
  source: string;
  /** Target node id */
  target: string;
  /** Relationship type — maps to theme colors (e.g. "follows", "owns") */
  type?: string;
  /** Edge weight (default: 1) */
  weight?: number;
  /** User-defined extra data */
  [key: string]: unknown;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Runtime node with layout positions (internal) */
export interface PositionedNode extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
}
