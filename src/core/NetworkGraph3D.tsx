/**
 * NetworkGraph3D — High-performance 3D graph renderer.
 *
 * Architecture:
 *   - 1 InstancedMesh  (all nodes → 1 draw call)
 *   - 1 LineSegments   (all edges → 1 draw call)
 *   - Web Worker        (force layout off main thread)
 *   - Post-processing   (UnrealBloomPass for glow)
 *
 * Total GPU draw calls: 2
 */
import {
  useEffect,
  useRef,
  useMemo,
  useState,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from "react";
import * as THREE from "three";

import type {
  GraphData,
  GraphNode,
  GraphLink,
  ThemeConfig,
  StyleConfig,
  LayoutConfig,
  RendererConfig,
  NetworkGraph3DRef,
  NullableNodeEventHandler,
  NullableLinkEventHandler,
  NodeEventHandler,
  LinkEventHandler,
  ContextMenuHandler,
  NodeDragHandler,
  LayoutSettledHandler,
  LayoutTickHandler,
} from "../types";
import { DEFAULT_STYLE } from "../types";
import { resolveTheme, type ResolvedTheme } from "../themes/resolve-theme";
import { resolveLayoutParams } from "../layout/layout-config";
import { createLayoutWorker } from "../layout/worker-source";
import {
  createScene,
  initBloom,
  startAnimationLoop,
  setupResize,
  type SceneState,
} from "./scene-setup";
import { createNodeMesh, computeNodeScales, updateNodePositions } from "./node-mesh";
import {
  createEdgeMesh,
  buildEdgeMappings,
  updateEdgePositions,
} from "./edge-mesh";
import { updateLabels, disposeLabelSystem } from "./label-system";
import { animateCamera, zoomToFitPositions } from "./camera";
import {
  buildAdjacencyMapFromLinks,
  computeHighlightSet,
  applyNodeHighlight,
  applyEdgeHighlight,
  updateSelectionRing,
} from "./selection";
import { setupInteraction } from "./interaction";
import { disposeObject } from "./dispose";

export interface NetworkGraph3DProps {
  /** Graph data: nodes and links */
  data: GraphData;
  /** Single-click on a node (null = background click / deselect) */
  onNodeClick?: NullableNodeEventHandler;
  /** Double-click on a node */
  onNodeDoubleClick?: NodeEventHandler;
  /** Hover on a node (null = hover out) */
  onNodeHover?: NullableNodeEventHandler;
  /** Right-click on a node — receives node + screen position for custom menu */
  onContextMenu?: ContextMenuHandler;
  /** Click on an edge/link */
  onLinkClick?: LinkEventHandler;
  /** Hover on an edge/link (null = hover out) */
  onLinkHover?: NullableLinkEventHandler;
  /** Node drag (fires continuously during drag) */
  onNodeDrag?: NodeDragHandler;
  /** Node drag end */
  onNodeDragEnd?: NodeDragHandler;
  /** Fired when force simulation converges */
  onLayoutSettled?: LayoutSettledHandler;
  /** Fired on each layout tick with current alpha */
  onLayoutTick?: LayoutTickHandler;
  /** Currently selected node ID (controlled mode) */
  selectedNodeId?: string | null;
  /** Number of hops to highlight around selected node (default: 3) */
  highlightHops?: number;
  /** Theme configuration or preset name */
  theme?: ThemeConfig | string;
  /** Visual style overrides */
  style?: StyleConfig;
  /** Force layout configuration */
  layout?: LayoutConfig;
  /** WebGL renderer configuration */
  renderer?: RendererConfig;
  /** Custom label text formatter */
  labelFormatter?: (node: GraphNode) => string;
  /** Custom node size accessor (overrides node.val) */
  nodeValueAccessor?: (node: GraphNode) => number;
}

/** Internal data state shared across effects */
interface DataState {
  nodes: GraphNode[];
  links: GraphData["links"];
  nodeIdToIndex: Map<string, number>;
  edgeNodeIndices: [number, number][];
  edgeLinkIndices: number[];
  positions: Float32Array | null;
  scales: Float32Array | null;
  settled: boolean;
}

/** Internal graph objects (meshes + worker) */
interface GraphObjects {
  nodesMesh: THREE.InstancedMesh;
  edgesMesh: THREE.LineSegments;
  edgeGeometry: THREE.BufferGeometry;
  edgePositionArray: Float32Array;
  worker: Worker | null;
}

function NetworkGraph3DInner(
  props: NetworkGraph3DProps,
  ref: Ref<NetworkGraph3DRef>
) {
  const {
    data,
    onNodeClick,
    onNodeDoubleClick,
    onNodeHover,
    onContextMenu,
    onLinkClick,
    onLinkHover,
    onNodeDrag,
    onNodeDragEnd,
    onLayoutSettled,
    onLayoutTick,
    selectedNodeId = null,
    highlightHops = 3,
    theme: themeProp,
    style: styleProp,
    layout: layoutProp,
    renderer: rendererProp,
    labelFormatter,
    nodeValueAccessor,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const resolvedStyle = useMemo(
    () => ({ ...DEFAULT_STYLE, ...styleProp }) as Required<StyleConfig>,
    [styleProp]
  );
  const resolvedTheme = useMemo(() => resolveTheme(themeProp), [themeProp]);

  // Persistent Three.js state
  const sceneRef = useRef<SceneState | null>(null);
  const graphObjRef = useRef<GraphObjects | null>(null);
  const dataRef = useRef<DataState>({
    nodes: [],
    links: [],
    nodeIdToIndex: new Map(),
    edgeNodeIndices: [],
    edgeLinkIndices: [],
    positions: null,
    scales: null,
    settled: false,
  });

  // Preserved positions: nodeId → {x,y,z}
  // Saved before mesh teardown so new worker can seed existing nodes
  const preservedPositionsRef = useRef<Record<string, { x: number; y: number; z: number }>>({});

  // Internal data for appendData — merged with external prop
  const [appendedData, setAppendedData] = useState<{
    nodes: GraphNode[];
    links: GraphLink[];
  } | null>(null);

  // Stable callback refs
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  const onNodeHoverRef = useRef(onNodeHover);
  const onContextMenuRef = useRef(onContextMenu);
  const onLinkClickRef = useRef(onLinkClick);
  const onLinkHoverRef = useRef(onLinkHover);
  const onNodeDragRef = useRef(onNodeDrag);
  const onNodeDragEndRef = useRef(onNodeDragEnd);
  const onLayoutSettledRef = useRef(onLayoutSettled);
  const onLayoutTickRef = useRef(onLayoutTick);
  const styleRef = useRef(resolvedStyle);
  const themeRef = useRef(resolvedTheme);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const labelFormatterRef = useRef(labelFormatter);
  const highlightSetRef = useRef<Map<string, number> | null>(null);
  onNodeClickRef.current = onNodeClick;
  onNodeDoubleClickRef.current = onNodeDoubleClick;
  onNodeHoverRef.current = onNodeHover;
  onContextMenuRef.current = onContextMenu;
  onLinkClickRef.current = onLinkClick;
  onLinkHoverRef.current = onLinkHover;
  onNodeDragRef.current = onNodeDrag;
  onNodeDragEndRef.current = onNodeDragEnd;
  onLayoutSettledRef.current = onLayoutSettled;
  onLayoutTickRef.current = onLayoutTick;
  styleRef.current = resolvedStyle;
  themeRef.current = resolvedTheme;
  selectedNodeIdRef.current = selectedNodeId;
  labelFormatterRef.current = labelFormatter;

  /* ── Merge external data with appended data ── */
  const mergedData: GraphData = useMemo(() => {
    if (!appendedData) return data;
    const existingIds = new Set(data.nodes.map((n) => n.id));
    const newNodes = appendedData.nodes.filter((n) => !existingIds.has(n.id));
    const existingEdges = new Set(
      data.links.map((l) => {
        const s = typeof l.source === "object" ? (l.source as any).id : l.source;
        const t = typeof l.target === "object" ? (l.target as any).id : l.target;
        return `${s}→${t}`;
      })
    );
    const newLinks = appendedData.links.filter((l) => {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      return !existingEdges.has(`${s}→${t}`);
    });
    if (newNodes.length === 0 && newLinks.length === 0) return data;
    return {
      nodes: [...data.nodes, ...newNodes],
      links: [...data.links, ...newLinks],
    };
  }, [data, appendedData]);

  /* ── Adjacency map ── */
  const adjacencyMap = useMemo(
    () => buildAdjacencyMapFromLinks(mergedData.links),
    [mergedData.links]
  );

  /* ── Highlight set ── */
  const highlightSet = useMemo(() => {
    if (!selectedNodeId) return null;
    return computeHighlightSet(selectedNodeId, adjacencyMap, highlightHops);
  }, [selectedNodeId, adjacencyMap, highlightHops]);

  /* ── Val range for node sizing ── */
  const valRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const n of mergedData.nodes) {
      const v = nodeValueAccessor ? nodeValueAccessor(n) : (n.val ?? 1);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min: isFinite(min) ? min : 1, max: isFinite(max) ? max : 1 };
  }, [mergedData.nodes, nodeValueAccessor]);

  /* ── Effect 1: Scene setup (mount once) ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const state = createScene(
      container,
      themeRef.current.backgroundColor,
      styleRef.current,
      rendererProp
    );
    sceneRef.current = state;

    // Animation loop with label updates (highlight-aware)
    const cancelAnim = startAnimationLoop(state, () => {
      updateLabels(
        state.labels,
        dataRef.current.nodes,
        dataRef.current.positions,
        dataRef.current.scales,
        state.camera,
        themeRef.current,
        styleRef.current.showLabels,
        styleRef.current.labelScale,
        styleRef.current.labelThreshold,
        styleRef.current.maxLabels,
        labelFormatterRef.current,
        highlightSetRef.current
      );
    });

    const resizeObserver = setupResize(container, state);

    // Interaction (scoped to container for keyboard isolation)
    const interaction = setupInteraction(
      state.renderer.domElement,
      state.camera,
      state.controls,
      () => graphObjRef.current?.nodesMesh ?? null,
      () => dataRef.current.nodes,
      {
        onNodeClick: (node) => onNodeClickRef.current?.(node),
        onNodeDoubleClick: (node) => onNodeDoubleClickRef.current?.(node),
        onNodeHover: (node) => onNodeHoverRef.current?.(node),
        onContextMenu: (node, pos) => onContextMenuRef.current?.(node, pos),
        onLinkClick: (link) => onLinkClickRef.current?.(link),
        onLinkHover: (link) => onLinkHoverRef.current?.(link),
        onNodeDrag: (node, pos) => {
          onNodeDragRef.current?.(node, pos);
          // Update position in data
          const d = dataRef.current;
          const idx = d.nodeIdToIndex.get(node.id);
          if (idx !== undefined && d.positions) {
            d.positions[idx * 3] = pos.x;
            d.positions[idx * 3 + 1] = pos.y;
            d.positions[idx * 3 + 2] = pos.z;
            (node as any).x = pos.x;
            (node as any).y = pos.y;
            (node as any).z = pos.z;
            // Update node mesh position
            const gObj = graphObjRef.current;
            if (gObj && d.scales) {
              updateNodePositions(gObj.nodesMesh, d.positions!, d.scales, d.nodes.length);
            }
          }
        },
        onNodeDragEnd: (node, pos) => onNodeDragEndRef.current?.(node, pos),
      },
      container,
      () => {
        const d = dataRef.current;
        return {
          links: d.links as GraphLink[],
          edgeNodeIndices: d.edgeNodeIndices,
          edgeLinkIndices: d.edgeLinkIndices,
          positions: d.positions,
        };
      }
    );

    return () => {
      cancelAnim();
      resizeObserver.disconnect();
      interaction.cleanup();
      state.keyboard.cleanup();
      state.controls.dispose();
      disposeObject(state.stars);
      disposeObject(state.selectionRing);
      state.selectionRing.children.forEach((c) => disposeObject(c));
      disposeLabelSystem(state.labels);
      disposeObject(state.labels.group);
      if (state.bloomPass) state.bloomPass.dispose();
      if (state.composer) {
        state.composer.passes.forEach((p) => (p as any).dispose?.());
      }
      state.renderer.dispose();
      const canvas = state.renderer.domElement;
      if (container.contains(canvas)) container.removeChild(canvas);
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Effect 2: Graph data → meshes + worker ── */
  useEffect(() => {
    const sceneState = sceneRef.current;
    if (!sceneState) return;
    const { scene, camera, controls, renderer } = sceneState;
    const nc = mergedData.nodes.length;
    if (nc === 0) return;

    const theme = themeRef.current;
    const style = styleRef.current;

    // Preserve positions from previous data before teardown
    const prevData = dataRef.current;
    if (prevData.positions && prevData.nodes.length > 0) {
      const saved: Record<string, { x: number; y: number; z: number }> = {};
      for (let i = 0; i < prevData.nodes.length; i++) {
        saved[prevData.nodes[i].id] = {
          x: prevData.positions[i * 3],
          y: prevData.positions[i * 3 + 1],
          z: prevData.positions[i * 3 + 2],
        };
      }
      preservedPositionsRef.current = saved;
    }

    // Cleanup previous
    const prev = graphObjRef.current;
    if (prev) {
      scene.remove(prev.nodesMesh);
      scene.remove(prev.edgesMesh);
      disposeObject(prev.nodesMesh);
      disposeObject(prev.edgesMesh);
      if (prev.worker) {
        prev.worker.postMessage({ type: "stop" });
        prev.worker.terminate();
      }
    }

    // Init bloom
    initBloom(sceneState, nc, style);

    // Fog
    if (nc < 15000 && style.fogDensity > 0) {
      scene.fog = new THREE.FogExp2(
        new THREE.Color(theme.backgroundColor).getHex(),
        style.fogDensity * 0.5
      );
    } else {
      scene.fog = null;
    }

    // Preprocess nodes: apply nodeValueAccessor
    const nodes = nodeValueAccessor
      ? mergedData.nodes.map((n) => ({ ...n, val: nodeValueAccessor(n) }))
      : mergedData.nodes;
    const links = mergedData.links;

    // Build index
    const nodeIdToIndex = new Map<string, number>();
    for (let i = 0; i < nc; i++) nodeIdToIndex.set(nodes[i].id, i);

    // Edge mappings
    const { edgeNodeIndices, edgeLinkIndices } = buildEdgeMappings(
      links,
      nodeIdToIndex
    );

    // Node scales
    const scales = computeNodeScales(nodes, style.nodeMinSize, style.nodeMaxSize);

    // Create meshes
    const { mesh: nodesMesh, material: nodeMat } = createNodeMesh(
      nodes,
      scales,
      theme
    );
    scene.add(nodesMesh);

    const edgeResult = createEdgeMesh(
      links,
      edgeNodeIndices,
      edgeLinkIndices,
      nc,
      style.edgeOpacity,
      theme
    );
    // Apply edge width scale
    (edgeResult.mesh.material as THREE.LineBasicMaterial).linewidth = style.edgeWidthScale;
    scene.add(edgeResult.mesh);

    // Update data ref
    dataRef.current = {
      nodes,
      links,
      nodeIdToIndex,
      edgeNodeIndices,
      edgeLinkIndices,
      positions: null,
      scales,
      settled: false,
    };

    graphObjRef.current = {
      nodesMesh,
      edgesMesh: edgeResult.mesh,
      edgeGeometry: edgeResult.geometry,
      edgePositionArray: edgeResult.positionArray,
      worker: null,
    };

    // Clear label cache on data change
    const lt = sceneState.labels.textureCache;
    for (const [, entry] of lt) {
      if (entry.texture) entry.texture.dispose();
    }
    lt.clear();

    /* ── Start Web Worker ── */
    let worker: Worker;
    try {
      worker = createLayoutWorker();
    } catch (err) {
      console.error("Graphier: Failed to create layout worker:", err);
      // Fallback: keep random positions
      const initPos = new Float32Array(nc * 3);
      const tmpMat = new THREE.Matrix4();
      const tmpVec = new THREE.Vector3();
      for (let i = 0; i < nc; i++) {
        nodesMesh.getMatrixAt(i, tmpMat);
        tmpVec.setFromMatrixPosition(tmpMat);
        initPos[i * 3] = tmpVec.x;
        initPos[i * 3 + 1] = tmpVec.y;
        initPos[i * 3 + 2] = tmpVec.z;
        (nodes[i] as any).x = tmpVec.x;
        (nodes[i] as any).y = tmpVec.y;
        (nodes[i] as any).z = tmpVec.z;
      }
      dataRef.current.positions = initPos;
      setTimeout(() => zoomToFitPositions(camera, controls, initPos, 800, 100), 300);
      return;
    }
    graphObjRef.current.worker = worker;

    worker.onerror = (err) => {
      console.error("Graphier: Layout worker error:", err);
    };

    worker.onmessage = (e) => {
      const msg = e.data;

      if (msg.type === "positions") {
        const positions = new Float32Array(msg.positions);
        dataRef.current.positions = positions;

        // Update node positions
        updateNodePositions(nodesMesh, positions, scales, nc);

        // Mutate node objects for focusNode compatibility
        for (let i = 0; i < nc; i++) {
          (nodes[i] as any).x = positions[i * 3];
          (nodes[i] as any).y = positions[i * 3 + 1];
          (nodes[i] as any).z = positions[i * 3 + 2];
        }

        // Update edges
        updateEdgePositions(
          edgeResult.positionArray,
          positions,
          edgeNodeIndices,
          edgeResult.geometry
        );

        // Keep selection ring synced during layout
        const selId = selectedNodeIdRef.current;
        if (selId && sceneState.selectionRing.visible) {
          const si = nodeIdToIndex.get(selId);
          if (si !== undefined) {
            sceneState.selectionRing.position.set(
              positions[si * 3],
              positions[si * 3 + 1],
              positions[si * 3 + 2]
            );
          }
        }

        // Layout tick callback
        onLayoutTickRef.current?.(msg.alpha);
      }

      if (msg.type === "settled") {
        dataRef.current.settled = true;
        onLayoutSettledRef.current?.();
      }
    };

    // Send layout params with preserved positions for existing nodes
    const layoutParams = resolveLayoutParams(nc, layoutProp);
    worker.postMessage({
      type: "init",
      nodes: nodes.map((n) => ({ id: n.id })),
      links: links.map((l) => ({
        source: typeof l.source === "object" ? (l.source as any).id : l.source,
        target: typeof l.target === "object" ? (l.target as any).id : l.target,
      })),
      params: layoutParams,
      initialPositions: preservedPositionsRef.current,
    });

    return () => {
      // Save positions before teardown for next init
      const d = dataRef.current;
      if (d.positions && d.nodes.length > 0) {
        const saved: Record<string, { x: number; y: number; z: number }> = {};
        for (let i = 0; i < d.nodes.length; i++) {
          saved[d.nodes[i].id] = {
            x: d.positions[i * 3],
            y: d.positions[i * 3 + 1],
            z: d.positions[i * 3 + 2],
          };
        }
        preservedPositionsRef.current = saved;
      }

      if (worker) {
        worker.postMessage({ type: "stop" });
        worker.terminate();
      }
      scene.remove(nodesMesh);
      scene.remove(edgeResult.mesh);
      disposeObject(nodesMesh);
      disposeObject(edgeResult.mesh);
      graphObjRef.current = null;
    };
  }, [mergedData, valRange, nodeValueAccessor, layoutProp]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Effect 3: Selection visual update ── */
  useEffect(() => {
    const gObj = graphObjRef.current;
    const sceneState = sceneRef.current;
    if (!gObj?.nodesMesh || !sceneState) return;

    const d = dataRef.current;
    const theme = themeRef.current;
    const style = styleRef.current;

    // Store highlight set for label system access
    highlightSetRef.current = highlightSet;

    applyNodeHighlight(
      gObj.nodesMesh,
      d.nodes,
      selectedNodeId,
      highlightSet,
      theme
    );

    applyEdgeHighlight(
      gObj.edgesMesh,
      d.links,
      d.edgeNodeIndices,
      d.edgeLinkIndices,
      highlightSet,
      style.edgeOpacity,
      d.nodes.length,
      theme
    );

    // Dynamic bloom boost during selection (match original behavior)
    if (sceneState.bloomPass) {
      const style = styleRef.current;
      if (highlightSet) {
        sceneState.bloomPass.strength = style.bloomStrength * 1.8;
        sceneState.bloomPass.radius = style.bloomRadius * 1.4;
        sceneState.bloomPass.threshold = 0.25;
      } else {
        sceneState.bloomPass.strength = style.bloomStrength;
        sceneState.bloomPass.radius = style.bloomRadius;
        sceneState.bloomPass.threshold = style.bloomThreshold;
      }
    }

    const selectedNode = selectedNodeId
      ? d.nodes.find((n) => n.id === selectedNodeId)
      : null;

    updateSelectionRing(
      sceneState.selectionRing,
      selectedNodeId,
      d.nodeIdToIndex,
      d.positions,
      d.scales,
      theme,
      selectedNode?.type
    );
  }, [selectedNodeId, highlightSet, mergedData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Effect 4: Live style updates ── */
  useEffect(() => {
    const s = sceneRef.current;
    if (!s?.bloomPass) return;
    s.bloomPass.strength = resolvedStyle.bloomStrength;
    s.bloomPass.radius = resolvedStyle.bloomRadius;
    s.bloomPass.threshold = resolvedStyle.bloomThreshold;
  }, [resolvedStyle.bloomStrength, resolvedStyle.bloomRadius, resolvedStyle.bloomThreshold]);

  // Node size live update
  useEffect(() => {
    const gObj = graphObjRef.current;
    if (!gObj?.nodesMesh) return;
    const { nodes, positions } = dataRef.current;
    if (!positions) return;
    const nc = nodes.length;

    const newScales = computeNodeScales(
      nodes,
      resolvedStyle.nodeMinSize,
      resolvedStyle.nodeMaxSize
    );
    dataRef.current.scales = newScales;
    updateNodePositions(gObj.nodesMesh, positions, newScales, nc);
  }, [resolvedStyle.nodeMinSize, resolvedStyle.nodeMaxSize, valRange]);

  // Edge opacity & width live update
  useEffect(() => {
    const gObj = graphObjRef.current;
    if (!gObj?.edgesMesh) return;
    const mat = gObj.edgesMesh.material as THREE.LineBasicMaterial;
    mat.opacity = resolvedStyle.edgeOpacity;
    mat.linewidth = resolvedStyle.edgeWidthScale;
  }, [resolvedStyle.edgeOpacity, resolvedStyle.edgeWidthScale]);

  // Fog live update
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (resolvedStyle.fogDensity > 0) {
      s.scene.fog = new THREE.FogExp2(
        new THREE.Color(themeRef.current.backgroundColor).getHex(),
        resolvedStyle.fogDensity * 0.5
      );
    } else {
      s.scene.fog = null;
    }
  }, [resolvedStyle.fogDensity]);

  // Star field toggle
  useEffect(() => {
    const s = sceneRef.current;
    if (!s?.stars) return;
    s.stars.visible = resolvedStyle.starField;
  }, [resolvedStyle.starField]);

  // Auto orbit
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !resolvedStyle.autoOrbit) return;

    let angle = 0;
    const id = setInterval(() => {
      if (!sceneRef.current) return;
      const cam = sceneRef.current.camera;
      const ctrl = sceneRef.current.controls;
      const dist = cam.position.length() || 800;
      angle += 0.003;
      cam.position.set(
        dist * Math.sin(angle),
        cam.position.y,
        dist * Math.cos(angle)
      );
      ctrl.update();
    }, 30);

    return () => clearInterval(id);
  }, [resolvedStyle.autoOrbit]);

  // Fly speed live update
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.keyboard.setFlySpeed(resolvedStyle.flySpeed);
  }, [resolvedStyle.flySpeed]);

  /* ── Imperative API via ref ── */
  useImperativeHandle(ref, () => ({
    cameraPosition(pos, lookAt, duration = 1000) {
      const s = sceneRef.current;
      if (!s) return;
      animateCamera(s.camera, s.controls, pos, lookAt, duration);
    },
    zoomToFit(duration = 800, padding = 100) {
      const s = sceneRef.current;
      const p = dataRef.current.positions;
      if (!s || !p) return;
      zoomToFitPositions(s.camera, s.controls, p, duration, padding);
    },
    zoomIn() {
      const s = sceneRef.current;
      if (!s) return;
      const { camera, controls } = s;
      const dir = camera.position.clone().sub(controls.target as THREE.Vector3);
      dir.multiplyScalar(0.65);
      const dest = (controls.target as THREE.Vector3).clone().add(dir);
      animateCamera(camera, controls, dest, controls.target as THREE.Vector3, 400);
    },
    zoomOut() {
      const s = sceneRef.current;
      if (!s) return;
      const { camera, controls } = s;
      const dir = camera.position.clone().sub(controls.target as THREE.Vector3);
      dir.multiplyScalar(1.5);
      const dest = (controls.target as THREE.Vector3).clone().add(dir);
      animateCamera(camera, controls, dest, controls.target as THREE.Vector3, 400);
    },
    focusNode(nodeId: string, duration = 1200) {
      const s = sceneRef.current;
      if (!s) return;
      const d = dataRef.current;
      const idx = d.nodeIdToIndex.get(nodeId);
      if (idx === undefined || !d.positions) return;
      const nx = d.positions[idx * 3];
      const ny = d.positions[idx * 3 + 1];
      const nz = d.positions[idx * 3 + 2];
      const dist = Math.hypot(nx, ny, nz);
      if (dist < 1) return;
      const ratio = 1 + 120 / dist;
      animateCamera(
        s.camera,
        s.controls,
        { x: nx * ratio, y: ny * ratio, z: nz * ratio },
        { x: nx, y: ny, z: nz },
        duration
      );
    },
    appendData(newNodes: GraphNode[], newLinks: GraphLink[]) {
      if (newNodes.length === 0 && newLinks.length === 0) return 0;

      // Deduplicate against current data
      const existingIds = new Set(dataRef.current.nodes.map((n) => n.id));
      const uniqueNodes = newNodes.filter((n) => !existingIds.has(n.id));

      // Trigger re-render with merged data (positions preserved via ref)
      setAppendedData((prev) => ({
        nodes: [...(prev?.nodes ?? []), ...uniqueNodes],
        links: [...(prev?.links ?? []), ...newLinks],
      }));

      return uniqueNodes.length;
    },
    getScene() {
      return sceneRef.current?.scene ?? null;
    },
    getRenderer() {
      return sceneRef.current?.renderer ?? null;
    },
    getCamera() {
      return sceneRef.current?.camera ?? null;
    },
    captureScreenshot() {
      const s = sceneRef.current;
      if (!s) return null;
      s.renderer.render(s.scene, s.camera);
      return s.renderer.domElement.toDataURL("image/png");
    },
    reheatLayout() {
      // Force re-run of layout by resetting settled state
      // The worker will be restarted on the next data change cycle
      const gObj = graphObjRef.current;
      if (gObj?.worker) {
        gObj.worker.postMessage({ type: "stop" });
        gObj.worker.terminate();
        gObj.worker = null;
      }
      dataRef.current.settled = false;
      // Trigger re-render by toggling appended data
      setAppendedData((prev) => prev ? { ...prev } : { nodes: [], links: [] });
    },
  }));

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      style={{ width: "100%", height: "100%", outline: "none" }}
    />
  );
}

export const NetworkGraph3D = forwardRef(NetworkGraph3DInner);
