/**
 * Graphier — High-performance 3D/2D graph renderer for React.
 *
 * @example
 * ```tsx
 * import { NetworkGraph3D } from 'graphier';
 *
 * <NetworkGraph3D
 *   data={{ nodes: [...], links: [...] }}
 *   onNodeClick={(node) => console.log(node)}
 * />
 * ```
 */

// ── Main 3D Component ──
export { NetworkGraph3D } from "./core/NetworkGraph3D";
export type { NetworkGraph3DProps } from "./core/NetworkGraph3D";

// ── 2D Subgraph Component ──
export { SubgraphView2D } from "./subgraph/SubgraphView2D";
export type { SubgraphView2DProps } from "./subgraph/SubgraphView2D";

// ── Node Detail Panel ──
export { NodeDetailPanel } from "./detail/NodeDetailPanel";
export type { NodeDetailPanelProps, ConnectionGroup } from "./detail/NodeDetailPanel";

// ── Subgraph Builder ──
export { buildSubgraph } from "./subgraph/subgraph-builder";
export type { SubgraphResult, SubgraphOptions } from "./subgraph/subgraph-builder";

// ── Types ──
export type {
  GraphNode,
  GraphLink,
  GraphData,
  PositionedNode,
  ThemeConfig,
  StyleConfig,
  LayoutConfig,
  RendererConfig,
  NetworkGraph3DRef,
  NodeEventHandler,
  NullableNodeEventHandler,
  LinkEventHandler,
  NullableLinkEventHandler,
  BackgroundClickHandler,
  ContextMenuHandler,
  NodeDragHandler,
  LayoutSettledHandler,
  LayoutTickHandler,
} from "./types";
export { DEFAULT_STYLE } from "./types/theme";
export { DEFAULT_LAYOUT } from "./types/layout";

// ── Themes ──
export { celestial, neon, minimal, resolveTheme } from "./themes";
export type { ResolvedTheme } from "./themes";

// ── Camera utilities (for external use) ──
export { animateCamera, zoomToFitPositions } from "./core/camera";

// ── Selection utilities (for external use) ──
export {
  buildAdjacencyMapFromLinks,
  computeHighlightSet,
} from "./core/selection";
