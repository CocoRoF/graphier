/**
 * SubgraphView2D — 2D Canvas force-directed subgraph renderer.
 * Renders a mini neighborhood graph centered on a specific node.
 */
import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
} from "d3-force-3d";
import type { GraphData, GraphNode, ThemeConfig } from "../types";
import { resolveTheme, type ResolvedTheme } from "../themes/resolve-theme";
import { buildAdjacencyMapFromLinks } from "../core/selection";
import { buildSubgraph, type SubgraphOptions } from "./subgraph-builder";

export interface SubgraphView2DProps {
  /** Full graph data */
  data: GraphData;
  /** Center node ID to build subgraph around */
  centerNodeId: string;
  /** Max hops from center (default: 3) */
  maxHops?: number;
  /** Max nodes in subgraph (default: 250) */
  maxNodes?: number;
  /** Theme config or preset name */
  theme?: ThemeConfig | string;
  /** Click on a node */
  onNodeClick?: (node: GraphNode) => void;
  /** Hover on a node */
  onNodeHover?: (node: GraphNode | null) => void;
  /** Custom label formatter */
  labelFormatter?: (node: GraphNode) => string;
  /** Container style overrides */
  style?: CSSProperties;
  /** Container class name */
  className?: string;
}

interface SimNode {
  id: string;
  label: string;
  type?: string;
  val: number;
  hop: number;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
  _radius?: number;
}

function defaultLabelText(node: GraphNode): string {
  const label = node.label ?? node.id ?? "";
  return label.length > 25 ? label.substring(0, 22) + "\u2026" : label;
}

export function SubgraphView2D(props: SubgraphView2DProps) {
  const {
    data,
    centerNodeId,
    maxHops = 3,
    maxNodes = 250,
    theme: themeProp,
    onNodeClick,
    onNodeHover,
    labelFormatter,
    style: styleProp,
    className,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);

  const resolvedTheme = useMemo(() => resolveTheme(themeProp), [themeProp]);

  const adjacencyMap = useMemo(
    () => buildAdjacencyMapFromLinks(data.links),
    [data.links]
  );

  const subgraph = useMemo(
    () =>
      buildSubgraph(data, centerNodeId, adjacencyMap, { maxHops, maxNodes }),
    [data, centerNodeId, adjacencyMap, maxHops, maxNodes]
  );

  /* ── 2D Force simulation + Canvas render ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || subgraph.nodes.length === 0) return;

    const container = canvas.parentElement;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const theme = resolvedTheme;
    const linkColors: Record<string, string> = {};

    // Build sim nodes
    const simNodes: SimNode[] = subgraph.nodes.map((n) => {
      const hop = subgraph.hops.get(n.id) ?? 3;
      return {
        id: n.id,
        label: n.label ?? n.id,
        type: n.type,
        val: n.val ?? 1,
        hop,
        x: (Math.random() - 0.5) * width * 0.3,
        y: (Math.random() - 0.5) * height * 0.3,
      };
    });

    // Fix center node at origin
    const centerNode = simNodes.find((n) => n.id === centerNodeId);
    if (centerNode) {
      centerNode.fx = 0;
      centerNode.fy = 0;
    }
    simNodesRef.current = simNodes;

    const simLinks = subgraph.links.map((l) => ({
      source: typeof l.source === "object" ? (l.source as any).id : l.source,
      target: typeof l.target === "object" ? (l.target as any).id : l.target,
      type: l.type,
    }));

    const nc = simNodes.length;
    const sim = forceSimulation(simNodes, 2)
      .force(
        "charge",
        forceManyBody()
          .strength(nc > 200 ? -40 : nc > 80 ? -70 : -120)
          .distanceMax(nc > 200 ? 200 : 300)
      )
      .force(
        "link",
        forceLink(simLinks)
          .id((d: any) => d.id)
          .distance(nc > 200 ? 25 : nc > 80 ? 40 : 60)
          .strength(0.3)
      )
      .force("center", forceCenter())
      .alphaDecay(0.04)
      .velocityDecay(0.4);

    let animFrame: number;

    function render() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      // ── Edges ──
      for (const link of simLinks) {
        const s = link.source as any;
        const t = link.target as any;
        if (typeof s !== "object" || typeof t !== "object") continue;
        const maxHop = Math.max(s.hop ?? 3, t.hop ?? 3);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = theme.linkColor(link.type);
        ctx.globalAlpha = maxHop <= 1 ? 0.4 : maxHop <= 2 ? 0.18 : 0.07;
        ctx.lineWidth = maxHop <= 1 ? 1.5 : 1;
        ctx.stroke();
      }

      // ── Nodes ──
      for (const n of simNodes) {
        const isCenter = n.id === centerNodeId;
        const baseR = Math.max(
          3,
          3 + (Math.log(n.val + 1) / Math.log(100)) * 6
        );
        const radius = isCenter ? 14 : Math.max(3, baseR - n.hop * 0.8);
        const alpha =
          n.hop === 0 ? 1 : n.hop === 1 ? 0.9 : n.hop === 2 ? 0.55 : 0.3;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = theme.nodeColor(n.type);
        ctx.fill();

        if (isCenter) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          // Glow
          ctx.save();
          ctx.shadowColor = theme.nodeColor(n.type);
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = theme.nodeColor(n.type);
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6;
          ctx.stroke();
          ctx.restore();
        }

        n._radius = radius;
      }

      // ── Labels ──
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const n of simNodes) {
        if (n.hop > 1 && n.val < 50) continue;
        const isCenter = n.id === centerNodeId;
        const fontSize = isCenter ? 13 : n.hop <= 1 ? 11 : 9;
        ctx.font = `bold ${fontSize}px -apple-system, "Segoe UI", sans-serif`;
        ctx.globalAlpha = isCenter ? 1 : n.hop <= 1 ? 0.8 : 0.4;

        const label = labelFormatter
          ? labelFormatter(
              subgraph.nodes.find((sn) => sn.id === n.id) ?? {
                id: n.id,
                label: n.label,
              }
            )
          : defaultLabelText({ id: n.id, label: n.label });
        const yOff = (n._radius ?? 5) + 4;

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillText(label, n.x + 1, n.y - yOff + 1);
        // Text
        ctx.fillStyle = isCenter
          ? "#ffffff"
          : theme.nodeColorBright(n.type);
        ctx.fillText(label, n.x, n.y - yOff);
      }

      ctx.restore();
    }

    sim.on("tick", () => {
      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(render);
    });

    return () => {
      sim.stop();
      cancelAnimationFrame(animFrame);
    };
  }, [subgraph, centerNodeId, resolvedTheme, labelFormatter]);

  /* ── Hit testing ── */
  const hitTest = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): SimNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      for (const n of simNodesRef.current) {
        const dx = n.x - mx;
        const dy = n.y - my;
        const r = (n._radius ?? 5) + 5;
        if (dx * dx + dy * dy < r * r) return n;
      }
      return null;
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const hit = hitTest(e);
      setHoveredNode(hit);
      if (onNodeHover) {
        if (hit) {
          const node = subgraph.nodes.find((n) => n.id === hit.id);
          onNodeHover(node ?? null);
        } else {
          onNodeHover(null);
        }
      }
    },
    [hitTest, onNodeHover, subgraph.nodes]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const hit = hitTest(e);
      if (hit && hit.id !== centerNodeId && onNodeClick) {
        const node = subgraph.nodes.find((n) => n.id === hit.id);
        if (node) onNodeClick(node);
      }
    },
    [hitTest, centerNodeId, onNodeClick, subgraph.nodes]
  );

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    ...styleProp,
  };

  return (
    <div className={className} style={containerStyle}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        style={{
          width: "100%",
          height: "100%",
          cursor: hoveredNode ? "pointer" : "default",
        }}
      />
    </div>
  );
}
