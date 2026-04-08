/**
 * Event handler types for graph components.
 */

import type { GraphNode, GraphLink } from "./graph";

export type NodeEventHandler = (node: GraphNode) => void;
export type NullableNodeEventHandler = (node: GraphNode | null) => void;
export type LinkEventHandler = (link: GraphLink) => void;
export type BackgroundClickHandler = () => void;
