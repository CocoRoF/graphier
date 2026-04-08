/**
 * NodeDetailPanel — Full-featured node detail modal/panel.
 *
 * Uses the SAME NetworkGraph3D (Three.js 3D renderer) for the
 * neighborhood subgraph — identical rendering quality as the main graph.
 *
 * Features:
 *   - Node overview with custom metadata via renderNodeMeta
 *   - Direct connections grouped by type (expand/collapse)
 *   - 3-hop neighborhood rendered in full 3D (NetworkGraph3D)
 *   - Keyboard: Escape to close (capture phase)
 *   - Overlay click to close
 *   - Navigation between nodes via connections or subgraph clicks
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { GraphData, GraphNode, GraphLink, ThemeConfig, NetworkGraph3DRef } from "../types";
import { resolveTheme } from "../themes/resolve-theme";
import { buildAdjacencyMapFromLinks } from "../core/selection";
import { buildSubgraph } from "../subgraph/subgraph-builder";
import { NetworkGraph3D } from "../core/NetworkGraph3D";

/* ── Types ── */

export interface ConnectionGroup {
  title: string;
  type: string;
  nodes: GraphNode[];
}

export interface NodeDetailPanelProps {
  node: GraphNode;
  data: GraphData;
  adjacencyMap?: Map<string, string[]>;
  onClose: () => void;
  onNodeNavigate: (node: GraphNode) => void;
  theme?: ThemeConfig | string;
  labelFormatter?: (node: GraphNode) => string;
  maxHops?: number;
  maxNodes?: number;
  renderNodeMeta?: (node: GraphNode) => ReactNode;
  groupConnections?: (directNeighbors: GraphNode[], links: GraphLink[]) => ConnectionGroup[];
  connectionLabel?: (node: GraphNode) => string;
  connectionSecondary?: (node: GraphNode) => ReactNode;
  modal?: boolean;
  className?: string;
  style?: CSSProperties;
}

/* ── Default grouping: by node.type ── */
function defaultGroupConnections(neighbors: GraphNode[]): ConnectionGroup[] {
  const byType = new Map<string, GraphNode[]>();
  for (const n of neighbors) {
    const t = n.type ?? "unknown";
    let group = byType.get(t);
    if (!group) { group = []; byType.set(t, group); }
    group.push(n);
  }
  const groups: ConnectionGroup[] = [];
  for (const [type, nodes] of byType) {
    nodes.sort((a, b) => (b.val ?? 0) - (a.val ?? 0));
    groups.push({ title: type.charAt(0).toUpperCase() + type.slice(1) + "s", type, nodes });
  }
  return groups;
}

/* ── Get direct (hop-1) connections ── */
function getDirectConnections(
  nodeId: string,
  subgraphNodes: GraphNode[],
  subgraphLinks: GraphLink[],
  hops: Map<string, number>
): GraphNode[] {
  const neighborIds = new Set<string>();
  for (const link of subgraphLinks) {
    const s = typeof link.source === "object" ? (link.source as any).id : link.source;
    const t = typeof link.target === "object" ? (link.target as any).id : link.target;
    const otherId = s === nodeId ? t : t === nodeId ? s : null;
    if (otherId && hops.get(otherId) === 1) neighborIds.add(otherId);
  }
  return subgraphNodes.filter((n) => neighborIds.has(n.id));
}

/* ── Expandable connection group ── */
function ConnectionGroupView({
  group, onNodeClick, connectionLabel, connectionSecondary, theme,
}: {
  group: ConnectionGroup;
  onNodeClick: (node: GraphNode) => void;
  connectionLabel?: (node: GraphNode) => string;
  connectionSecondary?: (node: GraphNode) => ReactNode;
  theme: ReturnType<typeof resolveTheme>;
}) {
  const [expanded, setExpanded] = useState(group.nodes.length <= 8);
  const shown = expanded ? group.nodes : group.nodes.slice(0, 5);

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#c9d1d9", padding: "4px 0" }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.nodeColor(group.type), flexShrink: 0 }} />
        {group.title}
        <span style={{ fontSize: 11, color: "#8b949e", background: "#21262d", borderRadius: 10, padding: "1px 7px", marginLeft: 4 }}>
          {group.nodes.length}
        </span>
        <span style={{ marginLeft: "auto", color: "#8b949e", fontSize: 11 }}>
          {expanded ? "\u25BE" : "\u25B8"}
        </span>
      </div>
      <div style={{ paddingLeft: 16 }}>
        {shown.map((n) => (
          <div
            key={n.id}
            onClick={() => onNodeClick(n)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", fontSize: 13, color: "#c9d1d9", cursor: "pointer", borderRadius: 4 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#161b22"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {connectionLabel ? connectionLabel(n) : (n.label ?? n.id)}
            </span>
            {connectionSecondary ? (
              <span style={{ fontSize: 12, color: "#8b949e", flexShrink: 0, marginLeft: 8 }}>{connectionSecondary(n)}</span>
            ) : (
              n.val != null && n.val > 1 && (
                <span style={{ fontSize: 12, color: "#8b949e", flexShrink: 0, marginLeft: 8 }}>{n.val}</span>
              )
            )}
          </div>
        ))}
        {!expanded && group.nodes.length > 5 && (
          <div onClick={() => setExpanded(true)} style={{ fontSize: 12, color: "#58a6ff", cursor: "pointer", padding: "4px 8px" }}>
            +{group.nodes.length - 5} more
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function NodeDetailPanel(props: NodeDetailPanelProps) {
  const {
    node, data, adjacencyMap: adjacencyMapProp, onClose, onNodeNavigate,
    theme: themeProp, labelFormatter, maxHops = 3, maxNodes = 250,
    renderNodeMeta, groupConnections, connectionLabel, connectionSecondary,
    modal = true, className, style: styleProp,
  } = props;

  const graphRef = useRef<NetworkGraph3DRef>(null);
  const resolvedTheme = useMemo(() => resolveTheme(themeProp), [themeProp]);

  /* ── Navigation history ── */
  const [currentNode, setCurrentNode] = useState<GraphNode>(node);
  const [history, setHistory] = useState<GraphNode[]>([]);
  const [forwardStack, setForwardStack] = useState<GraphNode[]>([]);

  /** Internal navigation — updates modal state only, does NOT touch main graph */
  function navigateTo(target: GraphNode) {
    setHistory((prev) => [...prev, currentNode]);
    setCurrentNode(target);
    setForwardStack([]);
  }

  function navigateBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setForwardStack((f) => [currentNode, ...f]);
    setCurrentNode(prev);
  }

  function navigateForward() {
    if (forwardStack.length === 0) return;
    const next = forwardStack[0];
    setHistory((h) => [...h, currentNode]);
    setForwardStack((f) => f.slice(1));
    setCurrentNode(next);
  }

  /** Navigate to node AND notify parent (e.g. close modal + focus main graph) */
  function navigateToMain(target: GraphNode) {
    onNodeNavigate(target);
  }

  const adjacencyMap = useMemo(
    () => adjacencyMapProp ?? buildAdjacencyMapFromLinks(data.links),
    [adjacencyMapProp, data.links]
  );

  const subgraph = useMemo(
    () => buildSubgraph(data, currentNode.id, adjacencyMap, { maxHops, maxNodes }),
    [data, currentNode.id, adjacencyMap, maxHops, maxNodes]
  );

  // Build subgraph GraphData for the 3D renderer
  const subgraphData: GraphData = useMemo(() => ({
    nodes: subgraph.nodes,
    links: subgraph.links,
  }), [subgraph]);

  const directNeighbors = useMemo(
    () => getDirectConnections(currentNode.id, subgraph.nodes, subgraph.links, subgraph.hops),
    [currentNode.id, subgraph]
  );

  const connGroups = useMemo(
    () => groupConnections ? groupConnections(directNeighbors, subgraph.links) : defaultGroupConnections(directNeighbors),
    [directNeighbors, subgraph.links, groupConnections]
  );

  const subStats = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const n of subgraph.nodes) { const t = n.type ?? "unknown"; byType[t] = (byType[t] || 0) + 1; }
    return { total: subgraph.nodes.length, edges: subgraph.links.length, byType };
  }, [subgraph]);

  const totalConns = directNeighbors.length;

  // Escape to close (capture phase — fires before container-scoped graph handlers)
  // Use stopImmediatePropagation to prevent any other window handlers from firing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  // Focus the selected node in subgraph after layout settles
  useEffect(() => {
    const timer = setTimeout(() => {
      graphRef.current?.focusNode(currentNode.id, 800);
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentNode.id]);

  /** Single click in subgraph → navigate within modal */
  function handleSubgraphClick(clickedNode: GraphNode | null) {
    if (clickedNode && clickedNode.id !== currentNode.id) {
      navigateTo(clickedNode);
    }
  }

  /** Double click in subgraph → close modal and navigate in main graph */
  function handleSubgraphDoubleClick(clickedNode: GraphNode) {
    if (clickedNode.id !== currentNode.id) {
      navigateToMain(clickedNode);
    }
  }

  const nodeLabel = currentNode.label ?? currentNode.id;

  const content = (
    <div
      style={{
        display: "flex", flexDirection: "column", width: "100%", height: "100%",
        background: "#0d1117", borderRadius: modal ? 12 : 0, overflow: "hidden",
        border: modal ? "1px solid #30363d" : "none", ...styleProp,
      }}
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {/* Back / Forward navigation */}
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <NavBtn
              disabled={history.length === 0}
              onClick={navigateBack}
              title="Back"
            >
              {"\u2190"}
            </NavBtn>
            <NavBtn
              disabled={forwardStack.length === 0}
              onClick={navigateForward}
              title="Forward"
            >
              {"\u2192"}
            </NavBtn>
          </div>
          {currentNode.type && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 12,
              background: resolvedTheme.nodeColor(currentNode.type) + "22",
              color: resolvedTheme.nodeColor(currentNode.type),
              textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0,
            }}>
              {currentNode.type}
            </span>
          )}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nodeLabel}
          </h2>
          {history.length > 0 && (
            <span style={{ fontSize: 11, color: "#484f58", flexShrink: 0 }}>
              ({history.length + 1} visited)
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", fontSize: 20, cursor: "pointer", padding: "4px 8px", lineHeight: 1, flexShrink: 0 }}>
          {"\u2715"}
        </button>
      </div>

      {/* ── Body: two-column layout ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Left: info panel */}
        <div style={{ width: "38%", minWidth: 260, maxWidth: 400, overflowY: "auto", padding: 20, borderRight: "1px solid #21262d" }}>
          {/* Overview */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, color: "#8b949e", margin: "0 0 12px 0", fontWeight: 600 }}>OVERVIEW</h3>
            {(currentNode as any).description && (
              <p style={{ fontSize: 13, color: "#c9d1d9", margin: "0 0 12px 0", lineHeight: 1.5 }}>{(currentNode as any).description}</p>
            )}
            {renderNodeMeta ? renderNodeMeta(currentNode) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {currentNode.val != null && <MetaItem label="Weight" value={String(currentNode.val)} />}
                {currentNode.type && <MetaItem label="Type" value={currentNode.type} />}
              </div>
            )}
          </div>

          {/* Direct Connections */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, color: "#8b949e", margin: "0 0 12px 0", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              DIRECT CONNECTIONS
              <span style={{ fontSize: 11, background: "#21262d", borderRadius: 10, padding: "1px 8px", color: "#c9d1d9" }}>{totalConns}</span>
            </h3>
            {connGroups.map((group) => (
              <ConnectionGroupView
                key={group.type} group={group} onNodeClick={navigateTo}
                connectionLabel={connectionLabel} connectionSecondary={connectionSecondary} theme={resolvedTheme}
              />
            ))}
            {totalConns === 0 && <p style={{ fontSize: 13, color: "#484f58" }}>No direct connections found</p>}
          </div>

          {/* Neighborhood summary */}
          <div style={{ padding: "12px 0", borderTop: "1px solid #21262d", fontSize: 12, color: "#8b949e" }}>
            <div>{Object.entries(subStats.byType).map(([type, count]) => `${count} ${type}`).join(" \u00B7 ")}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: "#484f58" }}>{subStats.edges} edges in {maxHops}-hop neighborhood</div>
          </div>
        </div>

        {/* Right: 3D neighborhood graph (same renderer as main) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #21262d", fontSize: 13, flexShrink: 0 }}>
            <span style={{ color: "#c9d1d9", fontWeight: 600 }}>{maxHops}-Hop Neighborhood</span>
            <span style={{ color: "#8b949e", fontSize: 12 }}>{subStats.total} nodes · {subStats.edges} edges</span>
          </div>
          <div style={{ flex: 1, position: "relative" }}>
            <NetworkGraph3D
              ref={graphRef}
              data={subgraphData}
              theme={themeProp}
              selectedNodeId={currentNode.id}
              highlightHops={maxHops}
              onNodeClick={handleSubgraphClick}
              onNodeDoubleClick={handleSubgraphDoubleClick}
              labelFormatter={labelFormatter}
              style={{
                bloomStrength: 0.6,
                bloomRadius: 0.1,
                bloomThreshold: 0.1,
                fogDensity: 0.0004,
                nodeMinSize: 1,
                nodeMaxSize: 15,
                starField: true,
              }}
            />
            {/* Floating controls */}
            <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", gap: 4, zIndex: 50 }}>
              <CtrlBtn title="Zoom to Fit" onClick={() => graphRef.current?.zoomToFit(800, 100)}>&#x2302;</CtrlBtn>
              <CtrlBtn title="Zoom In" onClick={() => graphRef.current?.zoomIn()}>+</CtrlBtn>
              <CtrlBtn title="Zoom Out" onClick={() => graphRef.current?.zoomOut()}>&minus;</CtrlBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!modal) return content;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}
    >
      <div style={{ width: "92vw", maxWidth: 1200, height: "82vh", maxHeight: 800 }}>
        {content}
      </div>
    </div>
  );
}

/* ── Helper components ── */
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#161b22", borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#f0f6fc" }}>{value}</div>
    </div>
  );
}

function NavBtn({ children, title, onClick, disabled }: { children: ReactNode; title: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, border: "1px solid #30363d", borderRadius: 6,
        background: disabled ? "transparent" : "#21262d",
        color: disabled ? "#30363d" : "#c9d1d9",
        fontSize: 14, lineHeight: 1, cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function CtrlBtn({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 36, height: 36, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
        background: "rgba(13,17,23,0.7)", backdropFilter: "blur(8px)",
        color: "#8b949e", fontSize: 18, lineHeight: 1, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(30,40,60,0.85)"; (e.currentTarget as HTMLElement).style.color = "#f0f6fc"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(13,17,23,0.7)"; (e.currentTarget as HTMLElement).style.color = "#8b949e"; }}
    >
      {children}
    </button>
  );
}
