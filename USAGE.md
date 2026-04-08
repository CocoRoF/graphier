# Graphier — Usage Guide

> High-performance 3D/2D graph renderer for React, powered by Three.js and d3-force-3d.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Quick Start](#2-quick-start)
3. [Core Component: NetworkGraph3D](#3-core-component-networkgraph3d)
4. [Props Reference](#4-props-reference)
5. [Imperative Ref API](#5-imperative-ref-api)
6. [Theme System](#6-theme-system)
7. [Style Configuration](#7-style-configuration)
8. [Layout Configuration](#8-layout-configuration)
9. [Renderer Configuration](#9-renderer-configuration)
10. [Node Detail Panel](#10-node-detail-panel)
11. [2D Subgraph View](#11-2d-subgraph-view)
12. [Graph Analysis Module](#12-graph-analysis-module)
13. [Keyboard Controls](#13-keyboard-controls)
14. [Incremental Data Update](#14-incremental-data-update)
15. [Advanced Patterns](#15-advanced-patterns)
16. [Next.js / SSR Setup](#16-nextjs--ssr-setup)
17. [Type Reference](#17-type-reference)
18. [Performance Notes](#18-performance-notes)

---

## 1. Installation

```bash
npm install @cocorof/graphier three react react-dom
```

**Peer dependencies:**

| Package     | Version     |
|-------------|-------------|
| `react`     | >= 18.0.0   |
| `react-dom` | >= 18.0.0   |
| `three`     | >= 0.150.0  |

---

## 2. Quick Start

```tsx
import { NetworkGraph3D, type GraphData } from "@cocorof/graphier";

const data: GraphData = {
  nodes: [
    { id: "alice", type: "person", label: "Alice", val: 10 },
    { id: "bob", type: "person", label: "Bob", val: 5 },
    { id: "project-x", type: "repo", label: "Project X", val: 20 },
  ],
  links: [
    { source: "alice", target: "project-x", type: "owns" },
    { source: "bob", target: "project-x", type: "contributes" },
    { source: "alice", target: "bob", type: "follows" },
  ],
};

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <NetworkGraph3D data={data} />
    </div>
  );
}
```

The component fills its parent container. Make sure the parent has explicit width and height.

---

## 3. Core Component: NetworkGraph3D

```tsx
import { useRef, useState } from "react";
import {
  NetworkGraph3D,
  type NetworkGraph3DRef,
  type GraphNode,
} from "@cocorof/graphier";

function MyGraph() {
  const graphRef = useRef<NetworkGraph3DRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <NetworkGraph3D
        ref={graphRef}
        data={data}
        selectedNodeId={selectedId}
        highlightHops={3}
        onNodeClick={(node) => setSelectedId(node?.id ?? null)}
        onNodeDoubleClick={(node) => console.log("double-click", node)}
        onNodeHover={(node) => console.log("hover", node?.id)}
        theme="celestial"
        style={{ bloomStrength: 0.7, fogDensity: 0.0004 }}
        labelFormatter={(node) => node.label ?? node.id}
        nodeValueAccessor={(node) => node.val ?? 1}
      />
    </div>
  );
}
```

---

## 4. Props Reference

### `NetworkGraph3DProps`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `GraphData` | **(required)** | Graph nodes and links |
| `selectedNodeId` | `string \| null` | `null` | Currently selected node (controlled mode) |
| `highlightHops` | `number` | `3` | N-hop highlight radius from selected node |
| `onNodeClick` | `(node: GraphNode \| null) => void` | — | Fires on node click or background click (null) |
| `onNodeDoubleClick` | `(node: GraphNode) => void` | — | Fires on node double-click |
| `onNodeHover` | `(node: GraphNode \| null) => void` | — | Fires on hover enter/leave |
| `theme` | `ThemeConfig \| string` | `"celestial"` | Theme object or preset name |
| `style` | `StyleConfig` | `DEFAULT_STYLE` | Visual style overrides |
| `layout` | `LayoutConfig` | `DEFAULT_LAYOUT` | Force layout configuration |
| `renderer` | `RendererConfig` | `{ antialias: false, pixelRatioMax: 1.5 }` | WebGL configuration |
| `labelFormatter` | `(node: GraphNode) => string` | — | Custom label text formatter |
| `nodeValueAccessor` | `(node: GraphNode) => number` | — | Custom node size accessor |

### `GraphData`

```typescript
interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
```

### `GraphNode`

```typescript
interface GraphNode {
  id: string;              // Unique identifier (required)
  type?: string;           // Category → maps to theme colors
  label?: string;          // Display label (defaults to id)
  val?: number;            // Size weight (default: 1)
  group?: string;          // Grouping key for auto color assignment
  [key: string]: unknown;  // Arbitrary extra data
}
```

### `GraphLink`

```typescript
interface GraphLink {
  source: string;          // Source node id (required)
  target: string;          // Target node id (required)
  type?: string;           // Relationship type → maps to theme colors
  weight?: number;         // Edge weight (default: 1)
  [key: string]: unknown;  // Arbitrary extra data
}
```

---

## 5. Imperative Ref API

Access the ref via `useRef<NetworkGraph3DRef>`:

```tsx
const graphRef = useRef<NetworkGraph3DRef>(null);

// Animate camera to a specific position
graphRef.current?.cameraPosition(
  { x: 100, y: 50, z: 200 },   // camera position
  { x: 0, y: 0, z: 0 },        // look-at target
  1000                            // duration (ms)
);

// Zoom to fit all nodes in view
graphRef.current?.zoomToFit(800, 100);  // duration, padding

// Zoom in / out
graphRef.current?.zoomIn();
graphRef.current?.zoomOut();

// Focus on a specific node
graphRef.current?.focusNode("node-id", 1200);

// Incrementally add data (no full rebuild)
const newCount = graphRef.current?.appendData(
  [{ id: "new-node", type: "person", label: "New" }],
  [{ source: "alice", target: "new-node", type: "follows" }]
);

// Access Three.js internals
const scene = graphRef.current?.getScene();
const renderer = graphRef.current?.getRenderer();
const camera = graphRef.current?.getCamera();

// Capture screenshot
const blob = await graphRef.current?.screenshot();
```

### Method Reference

| Method | Signature | Description |
|--------|-----------|-------------|
| `cameraPosition` | `(pos, lookAt, duration?) → void` | Animate camera to position |
| `zoomToFit` | `(duration?, padding?) → void` | Fit all nodes in view (default: 800ms, 100px) |
| `zoomIn` | `() → void` | Zoom toward center (×0.65) |
| `zoomOut` | `() → void` | Zoom away from center (×1.5) |
| `focusNode` | `(nodeId, duration?) → void` | Focus camera on a specific node (default: 1200ms) |
| `appendData` | `(nodes, links) → number` | Add nodes/links incrementally; returns count of new nodes added |
| `getScene` | `() → THREE.Scene \| null` | Access the Three.js scene |
| `getRenderer` | `() → THREE.WebGLRenderer \| null` | Access the WebGL renderer |
| `getCamera` | `() → THREE.PerspectiveCamera \| null` | Access the camera |
| `screenshot` | `() → Promise<Blob \| null>` | Capture current view as PNG blob |

---

## 6. Theme System

### Using Preset Themes

```tsx
// By name
<NetworkGraph3D data={data} theme="celestial" />
<NetworkGraph3D data={data} theme="neon" />
<NetworkGraph3D data={data} theme="minimal" />

// By import
import { celestial, neon, minimal } from "@cocorof/graphier";
<NetworkGraph3D data={data} theme={celestial} />
```

### Custom Theme

```tsx
import { celestial, type ThemeConfig } from "@cocorof/graphier";

const myTheme: ThemeConfig = {
  ...celestial,  // extend a preset
  nodeColors: {
    person: "#58a6ff",
    repo: "#3fb950",
    topic: "#d29922",
    org: "#bc8cff",
  },
  nodeColorsBright: {
    person: "#9dcfff",
    repo: "#7ee89a",
    topic: "#f0c45a",
    org: "#d8b4fe",
  },
  linkColors: {
    owns: "#58a6ff",
    contributes: "#8b949e",
    follows: "#da70d6",
  },
  defaultNodeColor: "#8b949e",
  defaultLinkColor: "#8b949e",
  backgroundColor: "#030810",
  palette: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7"],
};
```

### ThemeConfig Reference

| Property | Type | Description |
|----------|------|-------------|
| `nodeColors` | `Record<string, string>` | Node colors keyed by `node.type` |
| `nodeColorsBright` | `Record<string, string>` | Brighter variants for highlights (auto-generated if omitted) |
| `linkColors` | `Record<string, string>` | Edge colors keyed by `link.type` |
| `defaultNodeColor` | `string` | Fallback for unmapped node types |
| `defaultLinkColor` | `string` | Fallback for unmapped link types |
| `backgroundColor` | `string` | Scene background color |
| `palette` | `string[]` | Auto-assignment palette for types with no explicit mapping |

### Preset Theme Details

**Celestial** (default) — Deep space aesthetic with blue/green/gold tones.

**Neon** — High-contrast cyberpunk palette with bright greens and pinks.

**Minimal** — Muted, professional tones on a dark navy background.

---

## 7. Style Configuration

Control all visual parameters:

```tsx
<NetworkGraph3D
  data={data}
  style={{
    nodeMinSize: 2,
    nodeMaxSize: 18,
    edgeOpacity: 0.2,
    edgeWidthScale: 1.0,
    bloomStrength: 0.7,
    bloomRadius: 0.1,
    bloomThreshold: 0.1,
    starField: true,
    fogDensity: 0.0004,
    autoOrbit: false,
    labelScale: 1.2,
    labelThreshold: 0.8,
    showLabels: true,
    maxLabels: 200,
  }}
/>
```

### StyleConfig Reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `nodeMinSize` | `number` | `1` | Minimum node sphere radius |
| `nodeMaxSize` | `number` | `15` | Maximum node sphere radius |
| `edgeOpacity` | `number` | `0.15` | Edge line opacity (0–1) |
| `edgeWidthScale` | `number` | `1.0` | Edge line width multiplier |
| `bloomStrength` | `number` | `0.6` | Glow effect intensity |
| `bloomRadius` | `number` | `0.1` | Glow spread radius |
| `bloomThreshold` | `number` | `0.1` | Brightness threshold for glow |
| `starField` | `boolean` | `true` | Show background star particles |
| `fogDensity` | `number` | `0.0006` | Exponential fog density (0 = disabled) |
| `autoOrbit` | `boolean` | `false` | Auto-rotate camera |
| `labelScale` | `number` | `1.0` | Label text size multiplier |
| `labelThreshold` | `number` | `0.8` | Label visibility distance (0–1) |
| `showLabels` | `boolean` | `true` | Show labels at all |
| `maxLabels` | `number` | `150` | Maximum visible labels at once |

> **Note:** `edgeWidthScale` is applied as `linewidth` on `THREE.LineBasicMaterial`. Due to a WebGL limitation, most platforms only support `linewidth: 1`. For true variable-width lines, consider a custom post-processing approach.

---

## 8. Layout Configuration

The force-directed layout runs in a Web Worker (off main thread):

```tsx
<NetworkGraph3D
  data={data}
  layout={{
    type: "force-3d",
    charge: "auto",        // or a number like -200
    linkDistance: "auto",   // or a number like 250
    alphaDecay: "auto",    // or a number like 0.02
    velocityDecay: 0.4,
    settledThreshold: 0.005,
  }}
/>
```

### LayoutConfig Reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | `"force-3d"` | `"force-3d"` | Layout algorithm |
| `charge` | `"auto" \| number` | `"auto"` | Many-body force strength (negative = repulsion) |
| `linkDistance` | `"auto" \| number` | `"auto"` | Ideal distance between connected nodes |
| `alphaDecay` | `"auto" \| number` | `"auto"` | Simulation cooling rate |
| `velocityDecay` | `number` | `0.4` | Velocity damping (0–1) |
| `settledThreshold` | `number` | `0.005` | Alpha threshold to consider layout settled |

### Auto-Adaptive Parameters

When set to `"auto"`, parameters adapt based on the number of nodes:

| Parameter | n ≤ 10,000 | 10,000 < n ≤ 50,000 | n > 50,000 |
|-----------|------------|----------------------|------------|
| `charge` | -200 | -120 | -80 |
| `linkDistance` | 250 | 180 | 120 |
| `alphaDecay` | 0.02 | 0.03 | 0.04 |

This ensures good performance and visual quality across graph sizes.

---

## 9. Renderer Configuration

```tsx
<NetworkGraph3D
  data={data}
  renderer={{
    antialias: false,     // default: false (better performance)
    pixelRatioMax: 1.5,   // cap device pixel ratio
  }}
/>
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `antialias` | `boolean` | `false` | WebGL antialiasing |
| `pixelRatioMax` | `number` | `1.5` | Max device pixel ratio |

---

## 10. Node Detail Panel

A pre-built modal panel that shows node details, connections, and a 3D neighborhood subgraph:

```tsx
import { NetworkGraph3D, NodeDetailPanel, type GraphNode } from "@cocorof/graphier";

function App() {
  const [detailNode, setDetailNode] = useState<GraphNode | null>(null);
  const graphRef = useRef<NetworkGraph3DRef>(null);

  return (
    <>
      <NetworkGraph3D
        ref={graphRef}
        data={data}
        onNodeDoubleClick={(node) => setDetailNode(node)}
      />

      {detailNode && (
        <NodeDetailPanel
          node={detailNode}
          data={data}
          theme="celestial"
          onClose={() => setDetailNode(null)}
          onNodeNavigate={(node) => {
            setDetailNode(null);
            graphRef.current?.focusNode(node.id);
          }}
          maxHops={3}
          maxNodes={100}
          modal={true}
          renderNodeMeta={(node) => (
            <div>Custom metadata: {node.type}</div>
          )}
          connectionSecondary={(node) => (
            <span>{node.val} connections</span>
          )}
          labelFormatter={(node) => node.label ?? node.id}
        />
      )}
    </>
  );
}
```

### NodeDetailPanelProps Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `node` | `GraphNode` | **(required)** | Node to display |
| `data` | `GraphData` | **(required)** | Full graph data |
| `onClose` | `() => void` | **(required)** | Close handler |
| `onNodeNavigate` | `(node: GraphNode) => void` | **(required)** | Navigate to a node in the main graph |
| `theme` | `ThemeConfig \| string` | — | Theme config or preset |
| `adjacencyMap` | `Map<string, string[]>` | — | Pre-computed adjacency (computed internally if omitted) |
| `labelFormatter` | `(node: GraphNode) => string` | — | Custom label formatter |
| `maxHops` | `number` | `3` | Subgraph depth |
| `maxNodes` | `number` | `250` | Max nodes in subgraph |
| `renderNodeMeta` | `(node: GraphNode) => ReactNode` | — | Custom metadata section |
| `groupConnections` | `(neighbors, links) => ConnectionGroup[]` | — | Custom connection grouping |
| `connectionLabel` | `(node: GraphNode) => string` | — | Custom label per connection |
| `connectionSecondary` | `(node: GraphNode) => ReactNode` | — | Secondary info per connection |
| `modal` | `boolean` | `true` | Render as modal overlay |
| `className` | `string` | — | Container CSS class |
| `style` | `CSSProperties` | — | Container CSS styles |

### Navigation Behavior

- **Single click** on a node in the subgraph → navigates **within** the modal (internal history)
- **Double click** on a node in the subgraph → closes modal, navigates in the **main graph** via `onNodeNavigate`
- **Back/Forward buttons** in the modal header for navigation history
- **Escape** or clicking the overlay → closes the modal
- **Connection list clicks** → navigates within the modal

---

## 11. 2D Subgraph View

A lightweight 2D subgraph renderer (canvas-based, no Three.js overhead):

```tsx
import { SubgraphView2D } from "@cocorof/graphier";

<SubgraphView2D
  data={data}
  centerNodeId="alice"
  maxHops={2}
  maxNodes={50}
  theme="celestial"
  onNodeClick={(node) => console.log(node)}
  style={{ width: 400, height: 300 }}
/>
```

### SubgraphView2DProps Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `GraphData` | **(required)** | Full graph data |
| `centerNodeId` | `string` | **(required)** | Center node for subgraph extraction |
| `maxHops` | `number` | `3` | Subgraph depth |
| `maxNodes` | `number` | `250` | Maximum nodes |
| `theme` | `ThemeConfig \| string` | — | Theme config or preset |
| `onNodeClick` | `(node: GraphNode) => void` | — | Click handler |
| `onNodeHover` | `(node: GraphNode \| null) => void` | — | Hover handler |
| `labelFormatter` | `(node: GraphNode) => string` | — | Custom label |
| `style` | `CSSProperties` | — | Container CSS |
| `className` | `string` | — | Container class |

---

## 12. Graph Analysis Module

A tree-shakeable analytics module with **zero Three.js dependency**:

```tsx
import { analyzeGraph } from "@cocorof/graphier/analysis";

const stats = analyzeGraph(data);

console.log(stats.nodeCount);      // 1500
console.log(stats.linkCount);      // 4200
console.log(stats.density);        // 0.0037
console.log(stats.avgDegree);      // 5.6
console.log(stats.maxDegree);      // 42
console.log(stats.minDegree);      // 1
console.log(stats.nodesByType);    // { person: 500, repo: 800, topic: 200 }
console.log(stats.linksByType);    // { owns: 1000, contributes: 2500, ... }
console.log(stats.topByDegree(5)); // top 5 nodes by connection count
```

### Individual Functions

```tsx
import {
  computeDegreeMap,
  computeDegreeStats,
  topByDegree,
  computeDensity,
  computeLinkTypeBreakdown,
  findHubs,
  groupByType,
  buildAdjacencyMap,
  getNeighbors,
} from "@cocorof/graphier/analysis";

// Degree analysis
const degreeMap = computeDegreeMap(data);         // { nodeId: degree }
const stats = computeDegreeStats(degreeMap);       // { min, max, avg, total }
const top10 = topByDegree(data.nodes, degreeMap, 10);

// Density
const density = computeDensity(data.nodes.length, data.links.length);

// Link breakdown
const breakdown = computeLinkTypeBreakdown(data.links); // { type: count }

// Find hubs (nodes with degree >= threshold)
const hubs = findHubs(data.nodes, degreeMap, 10);

// Type distribution
const byType = groupByType(data.nodes);  // { type: count }

// Adjacency & neighbor traversal
const adjacencyMap = buildAdjacencyMap(data.links);
const neighbors = getNeighbors(adjacencyMap, "alice", 3); // Map<nodeId, hopDistance>
```

---

## 13. Keyboard Controls

When the graph container is focused (click anywhere on the graph):

| Key | Action |
|-----|--------|
| `Z` | Zoom in |
| `X` | Zoom out |
| `←` Arrow Left | Rotate camera left (azimuth) |
| `→` Arrow Right | Rotate camera right (azimuth) |
| `↑` Arrow Up | Rotate camera up (polar) |
| `↓` Arrow Down | Rotate camera down (polar) |
| `Escape` | Deselect current node |

**360° Rotation**: The camera supports full spherical rotation — no gimbal lock, no angle clamping. The camera "up" vector co-rotates with the polar rotation quaternion, allowing you to orbit past the poles smoothly.

**Container-scoped events**: Keyboard events are scoped to the graph container element. Multiple graph instances on the same page do not interfere with each other.

---

## 14. Incremental Data Update

Add nodes and links to a live graph without full rebuild:

```tsx
const graphRef = useRef<NetworkGraph3DRef>(null);

function handleExpandNode(nodeId: string) {
  // Fetch neighbors from your API
  const { newNodes, newLinks } = await fetchNeighbors(nodeId);

  // Append to the live graph — existing node positions are preserved
  const added = graphRef.current?.appendData(newNodes, newLinks);
  console.log(`Added ${added} new nodes`);
}
```

**How it works:**
1. New nodes are deduplicated by ID (existing nodes are skipped)
2. New links are merged into the graph
3. Existing node positions are preserved via the `initialPositions` mechanism
4. New nodes spawn at random positions near the graph center
5. The force simulation restarts to integrate new nodes
6. No full mesh teardown/rebuild occurs

**Position Preservation**: When the `data` prop changes entirely, existing node positions are saved before teardown and sent to the layout worker as `initialPositions`. This means:
- Switching from one dataset to another preserves positions of shared nodes
- Appending via `appendData` preserves all existing positions
- Only completely new nodes get random initial positions

---

## 15. Advanced Patterns

### Search & Focus

```tsx
function SearchBox({ graphRef }: { graphRef: RefObject<NetworkGraph3DRef> }) {
  const [query, setQuery] = useState("");

  async function handleSearch() {
    const results = await api.search(query);
    if (results.length > 0) {
      graphRef.current?.focusNode(results[0].id, 1200);
    }
  }

  return <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />;
}
```

### Enriched Node Data on Click

```tsx
function handleNodeClick(node: GraphNode | null) {
  if (!node) return;

  // Fetch enriched data from your API
  const enriched = await api.getNode(node.id);

  setSelectedNode({ ...node, ...enriched });
}
```

### Style Control Panel

```tsx
function StylePanel({ style, onChange }) {
  return (
    <div>
      <label>
        Bloom: <input type="range" min={0} max={2} step={0.1}
          value={style.bloomStrength}
          onChange={(e) => onChange({ ...style, bloomStrength: +e.target.value })}
        />
      </label>
      <label>
        Fog: <input type="range" min={0} max={0.002} step={0.0001}
          value={style.fogDensity}
          onChange={(e) => onChange({ ...style, fogDensity: +e.target.value })}
        />
      </label>
      <label>
        Labels: <input type="checkbox" checked={style.showLabels}
          onChange={(e) => onChange({ ...style, showLabels: e.target.checked })}
        />
      </label>
    </div>
  );
}

function App() {
  const [style, setStyle] = useState({
    bloomStrength: 0.6,
    fogDensity: 0.0006,
    showLabels: true,
  });

  return (
    <>
      <StylePanel style={style} onChange={setStyle} />
      <NetworkGraph3D data={data} style={style} />
    </>
  );
}
```

### Screenshot

```tsx
async function handleScreenshot() {
  const blob = await graphRef.current?.screenshot();
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graph-screenshot.png";
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### Fullscreen Toggle

```tsx
function toggleFullscreen(containerRef: RefObject<HTMLDivElement>) {
  const el = containerRef.current;
  if (!el) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    el.requestFullscreen();
  }
}
```

### Access Three.js Scene

```tsx
// Add custom objects to the scene
const scene = graphRef.current?.getScene();
if (scene) {
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
}
```

---

## 16. Next.js / SSR Setup

Graphier uses Three.js which requires browser APIs. For Next.js:

### Dynamic Import (Recommended)

```tsx
// app/page.tsx
"use client";

import dynamic from "next/dynamic";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

export default function Page() {
  return <GraphView />;
}
```

```tsx
// app/GraphView.tsx
"use client";

import { NetworkGraph3D } from "@cocorof/graphier";

export default function GraphView() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <NetworkGraph3D data={data} />
    </div>
  );
}
```

### next.config.js

For Next.js with Turbopack, add `graphier` to `transpilePackages`:

```js
// next.config.js
const nextConfig = {
  transpilePackages: ["@cocorof/graphier"],
};
export default nextConfig;
```

---

## 17. Type Reference

### All Exports

```typescript
// Components
export { NetworkGraph3D } from "@cocorof/graphier";
export { NodeDetailPanel } from "@cocorof/graphier";
export { SubgraphView2D } from "@cocorof/graphier";

// Types
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
  NetworkGraph3DProps,
  NodeDetailPanelProps,
  SubgraphView2DProps,
  SubgraphResult,
  SubgraphOptions,
  ConnectionGroup,
  NodeEventHandler,
  NullableNodeEventHandler,
  LinkEventHandler,
  BackgroundClickHandler,
  ResolvedTheme,
} from "@cocorof/graphier";

// Constants & Utilities
export {
  DEFAULT_STYLE,
  DEFAULT_LAYOUT,
  celestial,
  neon,
  minimal,
  resolveTheme,
  buildSubgraph,
  animateCamera,
  zoomToFitPositions,
  buildAdjacencyMapFromLinks,
  computeHighlightSet,
} from "@cocorof/graphier";

// Analysis (tree-shakeable, separate entry point)
export {
  analyzeGraph,
  computeDegreeMap,
  computeDegreeStats,
  topByDegree,
  computeDensity,
  computeLinkTypeBreakdown,
  computeNodeLinkCounts,
  findHubs,
  groupByType,
  buildAdjacencyMap,
  getNeighbors,
} from "@cocorof/graphier/analysis";
```

---

## 18. Performance Notes

### Rendering Architecture

- **2 GPU draw calls total**: 1 InstancedMesh for all nodes + 1 LineSegments for all edges
- **Custom GLSL shaders**: Fresnel rim glow + subsurface scatter on nodes
- **Web Worker layout**: Force simulation runs off main thread via transferable `Float32Array`
- **Adaptive LOD**: Sphere segment count adapts to graph size (16/12/8 segments)

### Auto-Adaptive Optimizations

The renderer automatically adapts to graph size:

| Graph Size | Bloom | Fog | Edge Opacity | LOD |
|------------|-------|-----|--------------|-----|
| < 5,000 | Full | Full | 0.15 | 16 segments |
| 5,000–15,000 | Reduced resolution | Reduced | Lower | 12 segments |
| > 15,000 | Minimal | Disabled | Minimal | 8 segments |

### Tips for Large Graphs

- Set `renderer.antialias` to `false` (default)
- Reduce `style.maxLabels` for 50k+ node graphs
- Use `layout.charge = "auto"` to let the system adapt
- Set `style.fogDensity = 0` for very large graphs
- The `graphier/analysis` module has zero Three.js dependency — safe for server-side use

---

## License

MIT
