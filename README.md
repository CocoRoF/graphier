# Graphier

High-performance 3D/2D graph renderer for React, built on Three.js with a d3-force-3d layout running in a Web Worker.

[![npm](https://img.shields.io/npm/v/@cocorof/graphier)](https://www.npmjs.com/package/@cocorof/graphier)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

Nodes are drawn as one `InstancedMesh` and edges as one `LineSegments`, so a graph costs two draw calls regardless of size. Layout, level of detail, bloom and fog adapt to the node count automatically.

## Install

```bash
npm install @cocorof/graphier three react react-dom
```

Peer dependencies: `react >= 18`, `react-dom >= 18`, `three >= 0.150`. The package ships ESM and CJS builds with type declarations.

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

The component fills its container, so give the parent an explicit size. `type` and `group` map to theme colors; `val` controls node size.

## Features

- Web Worker force layout (d3-force-3d) off the main thread; positions survive data changes
- 3D or flat 2D mode (`layout.dimensions: 2`), with optional `layout.clusterBy` (`"type"` or `"group"`)
- Nodes render as glowing, bloom-lit rings; star field, nebula backdrop and fog are optional
- Reheat-free filtering with `visibleNodeIds` and `linkVisibility`
- Click-to-focus, hover neighborhood highlight, N-hop selection highlight
- Pointer and keyboard navigation (fly, orbit or pan), remappable via `renderer.navigation`
- Incremental updates with `appendData()` (existing positions are kept)
- Four theme presets (`celestial`, `neon`, `minimal`, `paper` for light backgrounds) or a custom `ThemeConfig`
- Extra components: `GraphMinimap`, `NodeDetailPanel`, `SubgraphView2D`, plus `buildSubgraph`
- `@cocorof/graphier/analysis`: graph statistics with no Three.js dependency

## Large overviews: OverviewGraph

`NetworkGraph3D` simulates its layout in the browser, which is comfortable up to roughly 10 to 20 thousand nodes. For bigger networks, compute the layout once on a server and draw it with `OverviewGraph`, a 2D WebGL view built for 100k+ nodes and about a million edges:

- Every node and edge carries the zoom level from which it is drawn. The GPU hides the rest from one uniform, so zooming never rebuilds buffers. Below zoom 0 (a phone showing everything) only the most important nodes remain.
- Data arrives in chunks ordered by that level, so a phone can stop after the first one or two and a desktop can load all of them. Chunks are appended into preallocated buffers.
- Hover and click use a spatial grid; labels come from precomputed collision-free levels and are checked again on screen.
- Frames are drawn only when something changed. If frames get slow during interaction, detail drops a step.

```tsx
import { OverviewGraph, decodeChunk, type OverviewChunk, type OverviewMeta } from "@cocorof/graphier";

const meta: OverviewMeta = await (await fetch("/data/meta.json")).json();
const chunks: OverviewChunk[] = [];
for (const c of meta.chunks.slice(0, 2)) {
  const [bin, extra] = await Promise.all([fetch(`/data/${c.name}.bin`).then((r) => r.arrayBuffer()), fetch(`/data/${c.name}.json`).then((r) => r.json())]);
  chunks.push(decodeChunk(bin, extra));
}

<OverviewGraph meta={meta} chunks={chunks} theme="paper" colorBy="cluster" onSelect={(i) => console.log(i)} style={{ width: "100%", height: 600 }} />
```

The chunk format (GNC1) is documented in `src/overview/format.ts`. Ref methods: `flyTo`, `flyToRef`, `select`, `fit`, `zoomBy`, `getView`, `screenshot`. `OverviewEngine` is the same renderer without React.

To open a detailed view seeded from overview positions, pass the positions on the nodes and set `layout={{ preset: "seed", initialAlpha: 0.25 }}` (or `"pin"` to keep them exactly) on `NetworkGraph3D`.

## NetworkGraph3D props

| Prop | Description |
|------|-------------|
| `data` | `{ nodes, links }` (required) |
| `theme` | Preset name or `ThemeConfig` (default `"celestial"`) |
| `style` | `StyleConfig`: node size range, edge opacity, bloom, star field, nebula, fog, labels, `flySpeed`, `autoOrbit` |
| `layout` | `LayoutConfig`: `charge`, `linkDistance`, `alphaDecay`, `velocityDecay`, `spreadFactor`, `settledThreshold`, `dimensions`, `clusterBy`, `clusterStrength`, `preset`, `initialAlpha` |
| `renderer` | `RendererConfig`: `antialias`, `pixelRatioMax`, `cameraMode`, `navigation` |
| `selectedNodeId`, `highlightHops` | Controlled selection and highlight radius (default 3) |
| `visibleNodeIds`, `linkVisibility` | Filters that never re-run the layout |
| `enableNodeDrag`, `clickToFocus`, `hoverHighlight`, `hoverHighlightHops` | Interaction options |
| `labelFormatter`, `nodeValueAccessor` | Custom label text and node size |
| `onNodeClick`, `onNodeDoubleClick`, `onNodeHover`, `onContextMenu`, `onLinkClick`, `onLinkHover`, `onNodeDrag`, `onNodeDragEnd`, `onLayoutSettled`, `onLayoutTick` | Event callbacks |

Defaults for every option are in [USAGE.md](./USAGE.md) and in the exported `DEFAULT_STYLE` / `DEFAULT_LAYOUT`.

## Ref API

```tsx
import { useRef } from "react";
import { NetworkGraph3D, GraphMinimap, type NetworkGraph3DRef } from "@cocorof/graphier";

const ref = useRef<NetworkGraph3DRef>(null);

<NetworkGraph3D ref={ref} data={data} layout={{ dimensions: 2, clusterBy: "type" }} theme="paper" />
<GraphMinimap graphRef={ref} width={200} height={140} />

ref.current?.focusNode("alice", 1200);
ref.current?.zoomToFit(800, 100);
ref.current?.appendData(newNodes, newLinks); // returns number of nodes added
const png = ref.current?.captureScreenshot(); // PNG data URL
```

Methods: `cameraPosition`, `zoomToFit`, `zoomIn`, `zoomOut`, `focusNode`, `appendData`, `reheatLayout`, `panTo`, `captureScreenshot`, `hasUserAdjustedCamera`, `getScene`, `getRenderer`, `getCamera`, `getGraphSnapshot`, `getViewportRect`.

## Analysis

```ts
import { analyzeGraph } from "@cocorof/graphier/analysis";

const stats = analyzeGraph(data);
// nodeCount, linkCount, density, avgDegree, maxDegree, minDegree, degreeMap,
// nodesByType, linksByType, topByDegree(n)
```

## Keyboard

Keys apply while the graph container is focused. In fly mode (default in 3D) `Z`/`X` thrust forward/back and arrows or WASD steer; in orbit mode `Z`/`X` zoom and arrows orbit; in 2D (or `keyboard: "pan"`) arrows/WASD pan and `Z`/`X` zoom. `Escape` deselects.

## Next.js / SSR

The renderer needs the browser. Load it client-only:

```tsx
"use client";
import dynamic from "next/dynamic";
const GraphView = dynamic(() => import("./GraphView"), { ssr: false });
```

```js
// next.config.js
module.exports = { transpilePackages: ["@cocorof/graphier"] };
```

## Development

```bash
npm install
npm run typecheck  # tsc --noEmit
npm run build      # regenerate inlined worker, typecheck, vite build -> dist/
```

`src/layout/worker-inline.ts` is generated by `scripts/build-worker.js` from the worker source; rerun `npm run build` after changing the worker. The repository has no automated test suite.

## Documentation

- [USAGE.md](./USAGE.md): full API reference (English)
- [USAGE.ko.md](./USAGE.ko.md): Korean version

## License

Apache License 2.0. See [LICENSE](./LICENSE).
