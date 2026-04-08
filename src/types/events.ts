/**
 * Event handler types for graph components.
 */

import type { GraphNode, GraphLink } from "./graph";

export type NodeEventHandler = (node: GraphNode) => void;
export type NullableNodeEventHandler = (node: GraphNode | null) => void;
export type LinkEventHandler = (link: GraphLink) => void;
export type NullableLinkEventHandler = (link: GraphLink | null) => void;
export type BackgroundClickHandler = () => void;

/** Context menu event: node + screen position for rendering custom menu */
export type ContextMenuHandler = (
  node: GraphNode,
  position: { x: number; y: number }
) => void;

/** Node drag event (fires during drag) */
export type NodeDragHandler = (
  node: GraphNode,
  position: { x: number; y: number; z: number }
) => void;

/** Layout settled callback */
export type LayoutSettledHandler = () => void;

/** Layout tick callback with simulation alpha */
export type LayoutTickHandler = (alpha: number) => void;
