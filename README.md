# Graphier

High-performance 3D/2D graph renderer for React — powered by Three.js and d3-force-3d.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **2 GPU draw calls** — InstancedMesh (nodes) + LineSegments (edges) for maximum performance
- **Web Worker layout** — Force-directed simulation off the main thread (d3-force-3d)
- **Custom GLSL shaders** — Fresnel rim glow + subsurface scatter on every node
- **Post-processing** — UnrealBloomPass glow with adaptive resolution
- **Auto-adaptive** — Layout, LOD, bloom, and fog scale automatically with graph size
- **360 keyboard camera** — Full spherical rotation with quaternion-based controls, no gimbal lock
- **Incremental updates** — `appendData()` adds nodes/links without full rebuild
- **Position preservation** — Existing node positions survive data changes
- **Theme system** — 3 built-in presets (celestial, neon, minimal) + fully customizable
- **Node Detail Panel** — Modal with navigation history, connections list, and 3D subgraph
- **2D Subgraph View** — Lightweight canvas-based neighborhood renderer
- **Graph Analysis** — Tree-shakeable analytics module (`graphier/analysis`), zero Three.js dependency
- **TypeScript** — Full type safety with exported types
- **Dual ESM/CJS** — Works in all bundler configurations

## 2D Mode, Filtering & Minimap (v1.4)

```tsx
const ref = useRef<NetworkGraph3DRef>(null);

<NetworkGraph3D
  ref={ref}
  data={data}
  layout={{ dimensions: 2, clusterBy: "type" }}  // flat Obsidian-style plane
  theme="paper"                                   // light theme preset
  style={{ starField: false, bloomStrength: 0, fogDensity: 0 }}
  visibleNodeIds={visibleIds}   // hide/show WITHOUT re-running layout
  clickToFocus={false}          // select on click, no camera flight
  hoverHighlight                // neighbor highlight on hover
/>
<GraphMinimap graphRef={ref} width={200} height={140} />
```

- `layout.dimensions: 2` — simulation runs in 2D (z locked to 0); camera locks to pan/zoom (drag pans, wheel/pinch zooms, rotation off).
- `layout.clusterBy: "type" | "group"` + `clusterStrength` — pulls same-key nodes toward a shared centroid so categories form visible clusters.
- `visibleNodeIds` — client-side filter; hidden nodes/edges/labels vanish via per-instance scale + collapsed segments. Positions are preserved: toggling filters never reheats the simulation.
- `hoverHighlight` / `hoverHighlightHops` — Obsidian-style neighborhood emphasis on hover (selection wins while active).
- `theme="paper"` — light background preset; edge blending switches to normal automatically (additive lines vanish on white) and highlight/dim directions invert.
- `GraphMinimap` — 2D-canvas overview (no second WebGL context): draws all visible nodes + the camera viewport rectangle, click/drag to pan. Powered by `ref.getGraphSnapshot()` / `ref.getViewportRect()` / `ref.panTo(x, y)`.

## Install

```bash
npm install @cocorof/graphier three react react-dom
```

**Peer dependencies:** `react >= 18`, `react-dom >= 18`, `three >= 0.150`

## Quick Start

```tsx
import { NetworkGraph3D } from "@cocorof/graphier";

const data = {
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

## Ref API

```tsx
const graphRef = useRef<NetworkGraph3DRef>(null);

graphRef.current?.focusNode("alice", 1200);
graphRef.current?.zoomToFit(800, 100);
graphRef.current?.zoomIn();
graphRef.current?.zoomOut();
graphRef.current?.appendData(newNodes, newLinks);
graphRef.current?.screenshot();
```

## Theme & Style

```tsx
<NetworkGraph3D
  data={data}
  theme="celestial"              // or "neon", "minimal", or a ThemeConfig object
  style={{
    bloomStrength: 0.7,
    fogDensity: 0.0004,
    nodeMinSize: 2,
    nodeMaxSize: 18,
    showLabels: true,
    maxLabels: 200,
  }}
/>
```

## Analysis Module

```tsx
import { analyzeGraph } from "@cocorof/graphier/analysis";

const stats = analyzeGraph(data);
// stats.nodeCount, stats.density, stats.avgDegree, stats.topByDegree(10), ...
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `Z` / `X` | Zoom in / out |
| Arrow keys | 360 camera rotation |
| `Escape` | Deselect |

## Documentation

- [USAGE.md](./USAGE.md) — Full English documentation
- [USAGE.ko.md](./USAGE.ko.md) — 한국어 문서

## Next.js / SSR

```tsx
// app/page.tsx
"use client";
import dynamic from "next/dynamic";
const GraphView = dynamic(() => import("./GraphView"), { ssr: false });
```

```js
// next.config.js
const nextConfig = { transpilePackages: ["@cocorof/graphier"] };
```

## Architecture

```
NetworkGraph3D
├── InstancedMesh        (all nodes → 1 draw call)
├── LineSegments          (all edges → 1 draw call)
├── Web Worker            (d3-force-3d layout, off main thread)
├── UnrealBloomPass       (post-processing glow)
├── Sprite labels         (distance-culled, texture-cached)
└── Keyboard controls     (quaternion-based 360 rotation)
```

## License

MIT
