/**
 * OverviewEngine: a 2D WebGL renderer for very large precomputed networks (10k to 100k+ nodes, up to ~1M edges).
 *
 * Unlike NetworkGraph3D it never simulates: positions, importance, clusters and per-node zoom thresholds come
 * precomputed (see format.ts). Everything that scales with N is moved off the per-frame path:
 *
 *   • Level of detail on the GPU. Every node/edge carries the zoom level it appears at (nz/ez); the vertex
 *     shader hides the rest from a single uZoom uniform. Zooming re-renders, it never rebuilds buffers.
 *   • One draw call for all nodes (THREE.Points, one vertex per node, circle in the fragment shader) and one
 *     for all edges (LineSegments). Chunks are appended into preallocated buffers (no teardown).
 *   • Hit-testing uses a uniform spatial grid built once per chunk, so a hover checks a few cells, not N nodes,
 *     and is skipped while the user drags.
 *   • Labels are drawn on a 2D canvas overlay: candidates come from the precomputed label level (lz), then a
 *     screen-space occupancy grid prevents overlaps, capped by a label budget.
 *   • Render on demand: nothing is drawn unless the view, data or selection changed.
 *   • Adaptive quality: if frames take too long while interacting, the zoom bias and edge budget drop.
 */
import * as THREE from "three";

import type { OverviewChunk, OverviewCluster, OverviewMeta } from "./format";

export interface OverviewTheme {
  background: string;
  edge: string;
  edgeHighlight: string;
  label: string;
  labelHalo: string;
  clusterLabel: string;
  outline: string;
  select: string;
  /** Categorical palette for clusters (cycled). */
  palette: string[];
  /** Alpha of an average edge (0..1). */
  edgeAlpha: number;
}

export const OVERVIEW_THEMES: Record<"paper" | "night", OverviewTheme> = {
  paper: {
    background: "#ffffff", edge: "#94a3b8", edgeHighlight: "#4f46e5", label: "#0f172a", labelHalo: "#ffffff",
    clusterLabel: "#334155", outline: "#ffffff", select: "#111827", edgeAlpha: 0.22,
    palette: ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
              "#22c55e", "#3b82f6", "#a855f7", "#eab308", "#06b6d4", "#e11d48", "#84cc16", "#6366f1", "#d946ef", "#0891b2"],
  },
  night: {
    background: "#0b1020", edge: "#64748b", edgeHighlight: "#a5b4fc", label: "#e2e8f0", labelHalo: "#0b1020",
    clusterLabel: "#cbd5e1", outline: "#0b1020", select: "#f8fafc", edgeAlpha: 0.2,
    palette: ["#818cf8", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c", "#94a3b8",
              "#4ade80", "#60a5fa", "#c084fc", "#facc15", "#22d3ee", "#fb7185", "#a3e635", "#818cf8", "#e879f9", "#67e8f9"],
  },
};

export interface OverviewView {
  /** World center. */
  x: number;
  y: number;
  /** Pixels per world unit. */
  scale: number;
  /** Zoom level relative to the reference scale (what nz/lz were computed for). */
  zoom: number;
}

export interface OverviewEngineOptions {
  meta: OverviewMeta;
  theme?: OverviewTheme;
  /** +1 shows one more level of nodes than the data's reference density (fast devices), -1 one less. */
  zoomBias?: number;
  /** Maximum labels drawn at once. */
  labelBudget?: number;
  fontFamily?: string;
  /** Node size range in CSS pixels at zoom 0. */
  nodePx?: [number, number];
  colorBy?: "cluster" | "category";
  onSelect?: (index: number | null) => void;
  onHover?: (index: number | null) => void;
  onView?: (view: OverviewView) => void;
  onQuality?: (level: number) => void;
}

const GRID = 256;

interface Cam {
  x: number;
  y: number;
  scale: number;
}

/** Importance → size curve. Importance is usually a rank (uniform 0..1), so a steep curve keeps most nodes small
 *  and lets only the top few percent grow large. */
const SIZE_EXP = 3.0;
/** Node sizes grow gently with zoom: 2^(BOOST_PER_LEVEL·zoom), clamped. */
const BOOST_PER_LEVEL = 0.25;
const BOOST_MIN = 0.8;
const BOOST_MAX = 2.0;

const NODE_VERT = /* glsl */ `
  #define SIZE_EXP ${SIZE_EXP.toFixed(2)}
  uniform float uZoom;
  uniform float uPixelRatio;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uBoost;
  uniform float uDim;
  uniform float uImpCut;
  attribute float aImp;
  attribute float aNz;
  attribute float aState;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vState;
  varying float vSize;
  void main() {
    float vis = clamp(uZoom - aNz + 1.0, 0.0, 1.0);
    if (aImp < uImpCut) vis = 0.0;
    if (aState > 0.5) vis = 1.0;
    if (vis <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    // important nodes in front; highlighted ones in front of everything (a dimmed node must not hide them)
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, aImp * 0.5 + (aState > 0.5 ? 1.0 : 0.0), 1.0);
    float s = mix(uMinPx, uMaxPx, pow(aImp, SIZE_EXP)) * uBoost;
    if (aState > 2.5) s *= 1.7; else if (aState > 1.5) s *= 1.4; else if (aState > 0.5) s *= 1.3;
    vSize = max(s * uPixelRatio, 1.5);
    gl_PointSize = vSize;
    vColor = aColor;
    vState = aState;
    vAlpha = vis * ((uDim > 0.5 && aState < 0.5) ? 0.14 : 1.0);
  }
`;

const NODE_FRAG = /* glsl */ `
  uniform vec3 uOutline;
  uniform vec3 uSelect;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vState;
  varying float vSize;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float aa = 1.0 - smoothstep(1.0 - 2.0 / vSize, 1.0, r);
    float band = smoothstep(1.0 - 2.4 / vSize - 0.18, 1.0 - 0.18, r);
    vec3 col = mix(vColor, uOutline, band * 0.6);
    if (vState > 2.5) col = mix(col, uSelect, band);
    float a = vAlpha * aa;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const EDGE_VERT = /* glsl */ `
  uniform float uZoom;
  uniform float uDim;
  uniform float uAlpha;
  uniform float uEdgeCut;
  uniform float uImpCut;
  attribute float aEz;
  attribute float aImpMin;
  attribute float aW;
  attribute float aState;
  varying float vAlpha;
  varying float vState;
  void main() {
    float vis = clamp(uZoom - aEz - uEdgeCut + 1.0, 0.0, 1.0);
    if (aImpMin < uImpCut) vis = 0.0;
    if (aState > 0.5) vis = 1.0;
    vState = aState;
    if (vis <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
    vAlpha = vis * uAlpha * (0.3 + 0.7 * aW);
    if (uDim > 0.5) vAlpha = aState > 0.5 ? 0.85 : vAlpha * 0.12;
  }
`;

const EDGE_FRAG = /* glsl */ `
  uniform vec3 uEdge;
  uniform vec3 uEdgeHi;
  varying float vAlpha;
  varying float vState;
  void main() {
    if (vAlpha < 0.004) discard;
    gl_FragColor = vec4(vState > 0.5 ? uEdgeHi : uEdge, vAlpha);
  }
`;

function rgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export class OverviewEngine {
  readonly canvas: HTMLCanvasElement;
  readonly labelCanvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private opts: Required<Omit<OverviewEngineOptions, "onSelect" | "onHover" | "onView" | "onQuality" | "meta">> & OverviewEngineOptions;
  private meta: OverviewMeta;
  private theme: OverviewTheme;

  // node store (capacity = meta.nodes)
  private n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private imp: Float32Array;
  private nz: Uint8Array;
  private lz: Uint8Array;
  private cluster: Uint16Array;
  private cat: Uint8Array;
  private ref: Uint32Array;
  private labels: string[] = [];
  private sub: number[] = [];
  // edge store (capacity = meta.edges)
  private m = 0;
  private src: Uint32Array;
  private dst: Uint32Array;

  private nodeGeo = new THREE.BufferGeometry();
  private edgeGeo = new THREE.BufferGeometry();
  private nodeMat: THREE.ShaderMaterial;
  private edgeMat: THREE.ShaderMaterial;
  private nodeState: THREE.BufferAttribute;
  private edgeState: THREE.BufferAttribute;
  private nodeColor: THREE.BufferAttribute;

  // spatial grid for hit-testing and label candidates
  private cellOf: Int32Array;
  private buckets = new Map<number, number[]>();
  private gx0: number;
  private gsize: number;

  // view
  private w = 1;
  private h = 1;
  private dpr = 1;
  private view: Cam = { x: 0, y: 0, scale: 1 };
  private refScale = 1;
  private fitScale = 1;
  private bias: number;
  private qualityBias = 0;
  private edgeCut = 0;

  private selected: number | null = null;
  private hovered: number | null = null;
  private marked: number[] = [];
  private markedEdges: number[] = [];
  private frame = 0;
  private anim: { from: Cam; to: Cam; t0: number; dur: number } | null = null;
  private dragging = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private downAt: { x: number; y: number; t: number } | null = null;
  private pinchDist = 0;
  private slowFrames = 0;
  private lastFrameAt = 0;
  private frameMs = 0;
  /** Importance of nodes drawn at level 0, descending. Thins the view below zoom 0 (small screens). */
  private imp0: Float32Array | null = null;
  /** Nodes by label level (lz), each list by importance: label candidates when the view is wide. */
  private labelLevels: number[][] | null = null;
  private destroyed = false;
  private resizeObs: ResizeObserver;

  constructor(private container: HTMLElement, opts: OverviewEngineOptions) {
    this.meta = opts.meta;
    this.theme = opts.theme ?? OVERVIEW_THEMES.paper;
    this.opts = { zoomBias: 0, labelBudget: 60, fontFamily: "system-ui, sans-serif", nodePx: [3, 16], colorBy: "cluster", theme: this.theme, ...opts };
    this.bias = this.opts.zoomBias;
    const N = Math.max(1, opts.meta.nodes), E = Math.max(1, opts.meta.edges);
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.imp = new Float32Array(N);
    this.nz = new Uint8Array(N); this.lz = new Uint8Array(N); this.cluster = new Uint16Array(N); this.cat = new Uint8Array(N);
    this.ref = new Uint32Array(N); this.cellOf = new Int32Array(N);
    this.src = new Uint32Array(E); this.dst = new Uint32Array(E);
    const span = opts.meta.span || 1000;
    this.gx0 = -span * 1.05;
    this.gsize = (span * 2.1) / GRID;
    this.refScale = (opts.meta.view_px || 1200) / (2 * span);

    this.canvas = document.createElement("canvas");
    this.labelCanvas = document.createElement("canvas");
    for (const c of [this.canvas, this.labelCanvas]) {
      c.style.position = "absolute";
      c.style.inset = "0";
      c.style.width = "100%";
      c.style.height = "100%";
    }
    this.labelCanvas.style.pointerEvents = "none";
    this.canvas.style.touchAction = "none";
    container.appendChild(this.canvas);
    container.appendChild(this.labelCanvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(this.theme.background, 1);

    // nodes
    const nPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    this.nodeColor = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    this.nodeState = new THREE.BufferAttribute(new Float32Array(N), 1);
    this.nodeGeo.setAttribute("position", nPos);
    this.nodeGeo.setAttribute("aColor", this.nodeColor);
    this.nodeGeo.setAttribute("aImp", new THREE.BufferAttribute(new Float32Array(N), 1));
    this.nodeGeo.setAttribute("aNz", new THREE.BufferAttribute(new Float32Array(N), 1));
    this.nodeGeo.setAttribute("aState", this.nodeState);
    this.nodeGeo.setDrawRange(0, 0);
    this.nodeMat = new THREE.ShaderMaterial({
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, transparent: true, depthTest: true, depthWrite: true,
      uniforms: {
        uZoom: { value: 0 }, uPixelRatio: { value: 1 }, uMinPx: { value: this.opts.nodePx[0] }, uMaxPx: { value: this.opts.nodePx[1] },
        uBoost: { value: 1 }, uDim: { value: 0 }, uImpCut: { value: 0 }, uOutline: { value: new THREE.Color(this.theme.outline) },
        uSelect: { value: new THREE.Color(this.theme.select) },
      },
    });
    const points = new THREE.Points(this.nodeGeo, this.nodeMat);
    points.frustumCulled = false;
    points.renderOrder = 2;

    // edges
    this.edgeState = new THREE.BufferAttribute(new Float32Array(E * 2), 1);
    this.edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(E * 2 * 3), 3));
    this.edgeGeo.setAttribute("aEz", new THREE.BufferAttribute(new Float32Array(E * 2), 1));
    this.edgeGeo.setAttribute("aW", new THREE.BufferAttribute(new Float32Array(E * 2), 1));
    this.edgeGeo.setAttribute("aImpMin", new THREE.BufferAttribute(new Float32Array(E * 2), 1));
    this.edgeGeo.setAttribute("aState", this.edgeState);
    this.edgeGeo.setDrawRange(0, 0);
    this.edgeMat = new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uZoom: { value: 0 }, uDim: { value: 0 }, uAlpha: { value: this.theme.edgeAlpha }, uEdgeCut: { value: 0 }, uImpCut: { value: 0 },
        uEdge: { value: new THREE.Color(this.theme.edge) }, uEdgeHi: { value: new THREE.Color(this.theme.edgeHighlight) },
      },
    });
    const lines = new THREE.LineSegments(this.edgeGeo, this.edgeMat);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    this.scene.add(lines, points);

    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.fit(false);
  }

  // ── data ────────────────────────────────────────────

  get nodeCount(): number { return this.n; }
  /** CPU time of the last frame (draw submission + labels), ms. */
  get lastFrameMs(): number { return this.frameMs; }
  /** Current detail reduction from adaptive quality (0 = none). */
  get qualityLevel(): number { return this.edgeCut + -this.qualityBias * 2; }
  get edgeCount(): number { return this.m; }

  /** Append a decoded chunk. Chunks must arrive in order (their edges only reference nodes already appended). */
  append(c: OverviewChunk): void {
    const k = c.x.length;
    if (c.start !== this.n || this.n + k > this.x.length) throw new Error(`graphier: chunk start ${c.start} does not continue at ${this.n}`);
    const s0 = this.n;
    this.x.set(c.x, s0); this.y.set(c.y, s0); this.imp.set(c.imp, s0); this.nz.set(c.nz, s0); this.lz.set(c.lz, s0);
    this.cluster.set(c.cluster, s0); this.cat.set(c.lang, s0); this.ref.set(c.ref, s0);
    for (let i = 0; i < k; i++) { this.labels[s0 + i] = c.labels[i] ?? ""; this.sub[s0 + i] = c.sub[i] ?? 0; }
    const pos = this.nodeGeo.getAttribute("position") as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ia = (this.nodeGeo.getAttribute("aImp") as THREE.BufferAttribute).array as Float32Array;
    const za = (this.nodeGeo.getAttribute("aNz") as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < k; i++) {
      const g = s0 + i;
      pa[g * 3] = c.x[i]; pa[g * 3 + 1] = c.y[i]; pa[g * 3 + 2] = 0;
      ia[g] = c.imp[i]; za[g] = c.nz[i];
      const cell = this.cellIndex(c.x[i], c.y[i]);
      this.cellOf[g] = cell;
      let b = this.buckets.get(cell);
      if (!b) { b = []; this.buckets.set(cell, b); }
      b.push(g);
    }
    this.n += k;
    this.imp0 = null;
    this.labelLevels = null;
    this.paint(s0, k);
    for (const name of ["position", "aImp", "aNz"]) this.touch(this.nodeGeo.getAttribute(name) as THREE.BufferAttribute, s0, k);
    this.nodeGeo.setDrawRange(0, this.n);

    // edges
    const e0 = this.m, me = c.src.length;
    if (me) {
      if (this.m + me > this.src.length) throw new Error("graphier: edge capacity exceeded");
      this.src.set(c.src, e0); this.dst.set(c.dst, e0);
      const ep = (this.edgeGeo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      const ez = (this.edgeGeo.getAttribute("aEz") as THREE.BufferAttribute).array as Float32Array;
      const ew = (this.edgeGeo.getAttribute("aW") as THREE.BufferAttribute).array as Float32Array;
      const em = (this.edgeGeo.getAttribute("aImpMin") as THREE.BufferAttribute).array as Float32Array;
      for (let j = 0; j < me; j++) {
        const e = e0 + j, a = c.src[j], b = c.dst[j];
        ep[e * 6] = this.x[a]; ep[e * 6 + 1] = this.y[a]; ep[e * 6 + 2] = 0;
        ep[e * 6 + 3] = this.x[b]; ep[e * 6 + 4] = this.y[b]; ep[e * 6 + 5] = 0;
        ez[e * 2] = ez[e * 2 + 1] = c.ez[j];
        ew[e * 2] = ew[e * 2 + 1] = c.w[j] / 255;
        em[e * 2] = em[e * 2 + 1] = Math.min(this.imp[a], this.imp[b]);
      }
      this.m += me;
      for (const name of ["position", "aEz", "aW", "aImpMin"]) this.touch(this.edgeGeo.getAttribute(name) as THREE.BufferAttribute, e0 * 2, me * 2);
      this.edgeGeo.setDrawRange(0, this.m * 2);
    }
    this.requestRender();
  }

  /** Mark items [first, first+count) of an attribute for upload (only that range goes to the GPU). */
  private touch(attr: THREE.BufferAttribute, first: number, count: number): void {
    // three ≥ r159 uploads only the touched ranges; older versions re-upload the whole buffer
    if (typeof (attr as any).addUpdateRange === "function") attr.addUpdateRange(first * attr.itemSize, count * attr.itemSize);
    attr.needsUpdate = true;
  }

  private paint(start: number, count: number): void {
    const pal = this.theme.palette.map(rgb);
    const ca = this.nodeColor.array as Float32Array;
    for (let i = start; i < start + count; i++) {
      const key = this.opts.colorBy === "category" ? this.cat[i] : this.cluster[i];
      const c = this.opts.colorBy === "category" && key === 0 ? rgb(this.theme.edge) : pal[key % pal.length];
      ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2];
    }
    this.touch(this.nodeColor, start, count);
  }

  // ── options ─────────────────────────────────────────

  setTheme(theme: OverviewTheme): void {
    this.theme = theme;
    this.renderer.setClearColor(theme.background, 1);
    (this.nodeMat.uniforms.uOutline.value as THREE.Color).set(theme.outline);
    (this.nodeMat.uniforms.uSelect.value as THREE.Color).set(theme.select);
    (this.edgeMat.uniforms.uEdge.value as THREE.Color).set(theme.edge);
    (this.edgeMat.uniforms.uEdgeHi.value as THREE.Color).set(theme.edgeHighlight);
    this.edgeMat.uniforms.uAlpha.value = theme.edgeAlpha;
    this.paint(0, this.n);
    this.requestRender();
  }

  setColorBy(by: "cluster" | "category"): void {
    if (this.opts.colorBy === by) return;
    this.opts.colorBy = by;
    this.paint(0, this.n);
    this.requestRender();
  }

  setZoomBias(bias: number): void {
    this.bias = bias;
    this.requestRender();
  }

  setLabelBudget(n: number): void {
    this.opts.labelBudget = n;
    this.requestRender();
  }

  // ── lookups ─────────────────────────────────────────

  info(i: number): { index: number; ref: number; label: string; sub: number; cluster: number; category: number; importance: number; x: number; y: number } | null {
    if (i < 0 || i >= this.n) return null;
    return { index: i, ref: this.ref[i], label: this.labels[i], sub: this.sub[i], cluster: this.cluster[i], category: this.cat[i],
             importance: this.imp[i], x: this.x[i], y: this.y[i] };
  }

  /** Index of the node with this caller id among loaded nodes (linear; use for occasional lookups). */
  indexOfRef(ref: number): number {
    for (let i = 0; i < this.n; i++) if (this.ref[i] === ref) return i;
    return -1;
  }

  /** Neighbors of a node among loaded edges (O(E) once, called on selection, not per frame). */
  neighbors(i: number): { nodes: number[]; edges: number[] } {
    const nodes: number[] = [], edges: number[] = [];
    for (let e = 0; e < this.m; e++) {
      if (this.src[e] === i) { nodes.push(this.dst[e]); edges.push(e); } else if (this.dst[e] === i) { nodes.push(this.src[e]); edges.push(e); }
    }
    return { nodes, edges };
  }

  // ── selection ───────────────────────────────────────

  select(i: number | null): void {
    const st = this.nodeState.array as Float32Array, es = this.edgeState.array as Float32Array;
    for (const k of this.marked) st[k] = 0;
    for (const e of this.markedEdges) { es[e * 2] = 0; es[e * 2 + 1] = 0; }
    this.marked = [];
    this.markedEdges = [];
    this.selected = i != null && i >= 0 && i < this.n ? i : null;
    if (this.selected != null) {
      const nb = this.neighbors(this.selected);
      for (const k of nb.nodes) { st[k] = 2; this.marked.push(k); }
      for (const e of nb.edges) { es[e * 2] = 1; es[e * 2 + 1] = 1; this.markedEdges.push(e); }
      st[this.selected] = 3;
      this.marked.push(this.selected);
    }
    if (this.hovered != null && this.hovered !== this.selected && st[this.hovered] === 0) { st[this.hovered] = 1; this.marked.push(this.hovered); }
    this.nodeState.needsUpdate = true;
    this.edgeState.needsUpdate = true;
    this.nodeMat.uniforms.uDim.value = this.selected != null ? 1 : 0;
    this.edgeMat.uniforms.uDim.value = this.selected != null ? 1 : 0;
    this.requestRender();
  }

  get selection(): number | null { return this.selected; }

  // ── view ────────────────────────────────────────────

  getView(): OverviewView {
    return { ...this.view, zoom: Math.log2(this.view.scale / this.refScale) };
  }

  setView(v: { x: number; y: number; scale: number }, animate = true): void {
    const to = { x: v.x, y: v.y, scale: Math.max(this.fitScale * 0.5, Math.min(v.scale, this.refScale * 2 ** (this.meta.zoom_levels + 3))) };
    if (!animate) { this.view = to; this.anim = null; this.requestRender(); return; }
    this.anim = { from: { ...this.view }, to, t0: performance.now(), dur: 650 };
    this.requestRender();
  }

  fit(animate = true): void {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    if (this.n) {
      for (let i = 0; i < this.n; i++) {
        const x = this.x[i], y = this.y[i];
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    } else {
      const s = this.meta.span || 1000;
      minx = miny = -s; maxx = maxy = s;
    }
    const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
    this.fitScale = Math.min(this.w / (bw * 1.08), this.h / (bh * 1.08));
    this.setView({ x: (minx + maxx) / 2, y: (miny + maxy) / 2, scale: this.fitScale }, animate);
  }

  /** Fly to a node, zooming in at least far enough that it is drawn. */
  flyTo(i: number, minZoom = 1.5): void {
    if (i < 0 || i >= this.n) return;
    const need = Math.max(minZoom, this.nz[i] - this.bias - this.qualityBias + 0.2);
    const scale = Math.max(this.view.scale, this.refScale * 2 ** need);
    this.setView({ x: this.x[i], y: this.y[i], scale }, true);
  }

  zoomBy(f: number): void {
    this.setView({ x: this.view.x, y: this.view.y, scale: this.view.scale * f }, true);
  }

  // ── rendering ───────────────────────────────────────

  requestRender(): void {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame((t) => { this.frame = 0; this.renderFrame(t); });
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.labelCanvas.width = Math.round(this.w * this.dpr);
    this.labelCanvas.height = Math.round(this.h * this.dpr);
    this.nodeMat.uniforms.uPixelRatio.value = this.dpr;
    const prevFit = this.fitScale;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i], y = this.y[i];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    if (this.n) this.fitScale = Math.min(this.w / ((maxx - minx || 1) * 1.08), this.h / ((maxy - miny || 1) * 1.08));
    if (prevFit === 1 && this.view.scale === 1) this.view.scale = this.fitScale;
    this.requestRender();
  }

  /**
   * Below zoom 0 the screen is smaller than the reference the levels were computed for (a phone showing
   * the whole graph): keep only the most important level-0 nodes, a quarter as many per level (area ∝ 4^z).
   */
  private impCut(zEff: number): number {
    if (zEff >= 0 || !this.n) return 0;
    if (!this.imp0) {
      const a: number[] = [];
      for (let i = 0; i < this.n; i++) if (this.nz[i] === 0) a.push(this.imp[i]);
      a.sort((p, q) => q - p);
      this.imp0 = Float32Array.from(a);
    }
    const keep = Math.max(40, Math.round(this.imp0.length * Math.pow(4, zEff)));
    return keep >= this.imp0.length ? 0 : this.imp0[keep - 1];
  }

  private renderFrame(t: number): void {
    if (this.destroyed) return;
    if (this.anim) {
      const k = Math.min(1, (t - this.anim.t0) / this.anim.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const { from, to } = this.anim;
      const ls = Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e;
      this.view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, scale: Math.exp(ls) };
      if (k >= 1) this.anim = null; else this.requestRender();
    }
    const { x, y, scale } = this.view;
    const hw = this.w / (2 * scale), hh = this.h / (2 * scale);
    this.camera.left = x - hw; this.camera.right = x + hw; this.camera.top = y + hh; this.camera.bottom = y - hh;
    this.camera.updateProjectionMatrix();
    const zReal = Math.log2(scale / this.refScale);
    const zEff = zReal + this.bias + this.qualityBias;
    const z = Math.max(0, zEff);
    const cut = this.impCut(zEff);
    this.nodeMat.uniforms.uZoom.value = z;
    this.edgeMat.uniforms.uZoom.value = z;
    this.nodeMat.uniforms.uImpCut.value = cut;
    this.edgeMat.uniforms.uImpCut.value = cut;
    this.edgeMat.uniforms.uEdgeCut.value = this.edgeCut;
    this.nodeMat.uniforms.uBoost.value = this.boost(zReal);
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.drawLabels(zReal, z, cut);
    this.frameMs = performance.now() - t0;
    this.watchQuality(t0);
    this.opts.onView?.({ x, y, scale, zoom: zReal });
  }

  /** If frames are slow while the user interacts, show less (bias −0.5 per step, then thin out edges). */
  private watchQuality(t0: number): void {
    const now = performance.now();
    const interacting = this.dragging || this.anim != null || this.pointers.size > 0;
    const gap = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;
    if (!interacting) return;
    const slow = now - t0 > 28 || (gap > 50 && gap < 400);
    this.slowFrames = slow ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames >= 8) {
      this.slowFrames = 0;
      if (this.edgeCut < 2) this.edgeCut += 1;
      else if (this.qualityBias > -1.5) this.qualityBias -= 0.5;
      this.opts.onQuality?.(this.edgeCut + -this.qualityBias * 2);
    }
  }

  private toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.view.x) * this.view.scale + this.w / 2, (this.view.y - wy) * this.view.scale + this.h / 2];
  }

  private toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.view.scale + this.view.x, this.view.y - (sy - this.h / 2) / this.view.scale];
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((x - this.gx0) / this.gsize)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((y - this.gx0) / this.gsize)));
    return cy * GRID + cx;
  }

  private visibleAt(i: number, z: number, cut = 0): boolean {
    return (this.nz[i] <= z + 1e-6 && this.imp[i] >= cut) || (this.nodeState.array as Float32Array)[i] > 0.5;
  }

  private boost(zReal: number): number {
    return Math.min(BOOST_MAX, Math.max(BOOST_MIN, Math.pow(2, zReal * BOOST_PER_LEVEL)));
  }

  /** Drawn diameter of a node in CSS px (matches the vertex shader). */
  private nodePx(i: number, zReal: number): number {
    const [a, b] = this.opts.nodePx;
    return (a + (b - a) * Math.pow(this.imp[i], SIZE_EXP)) * this.boost(zReal);
  }

  private drawLabels(zReal: number, z: number, cut: number): void {
    const ctx = this.labelCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const font = this.opts.fontFamily;
    // cluster labels at low zoom (fade out as you zoom in)
    const clusters: OverviewCluster[] = this.meta.clusters ?? [];
    const ca = Math.max(0, Math.min(1, 1.4 - zReal));
    const occ = new Set<number>();
    const OCC = 24;
    const occupy = (x0: number, y0: number, x1: number, y1: number): boolean => {
      const a = Math.floor(x0 / OCC), b = Math.floor(x1 / OCC), c = Math.floor(y0 / OCC), d = Math.floor(y1 / OCC);
      for (let gx = a; gx <= b; gx++) for (let gy = c; gy <= d; gy++) if (occ.has(gx * 10007 + gy)) return false;
      for (let gx = a; gx <= b; gx++) for (let gy = c; gy <= d; gy++) occ.add(gx * 10007 + gy);
      return true;
    };
    const halo = (text: string, sx: number, sy: number, size: number, weight: number, color: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = this.theme.labelHalo;
      ctx.strokeText(text, sx, sy);
      ctx.fillStyle = color;
      ctx.fillText(text, sx, sy);
    };
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // the selected and hovered nodes always get labels first, then the selection's neighbors
    const pinned: number[] = [];
    if (this.selected != null) pinned.push(this.selected);
    if (this.hovered != null && this.hovered !== this.selected) pinned.push(this.hovered);
    for (const i of pinned) {
      const [sx, sy] = this.toScreen(this.x[i], this.y[i]);
      const size = 13;
      ctx.font = `600 ${size}px ${font}`;
      const tw = ctx.measureText(this.labels[i]).width;
      const ly = sy - this.nodePx(i, zReal) / 2 - 10;
      occupy(sx - tw / 2 - 4, ly - 8, sx + tw / 2 + 4, ly + 8);
      halo(this.labels[i], sx, ly, size, 600, this.theme.label, 1);
    }
    if (this.selected != null) {
      const st = this.nodeState.array as Float32Array;
      const nb = this.marked.filter((i) => st[i] === 2).sort((a, b) => this.imp[b] - this.imp[a]).slice(0, 40);
      for (const i of nb) {
        const [sx, sy] = this.toScreen(this.x[i], this.y[i]);
        if (sx < 0 || sx > this.w || sy < 0 || sy > this.h) continue;
        ctx.font = `500 12px ${font}`;
        const tw = ctx.measureText(this.labels[i]).width;
        const ly = sy - this.nodePx(i, zReal) / 2 - 8;
        if (!occupy(sx - tw / 2 - 2, ly - 6, sx + tw / 2 + 2, ly + 6)) continue;
        halo(this.labels[i], sx, ly, 12, 500, this.theme.label, 0.95);
      }
    }
    if (ca > 0.02 && clusters.length && this.selected == null) {
      // only clusters that are big on screen get a name (on a phone, fewer)
      const minR = Math.max(36, Math.min(this.w, this.h) * 0.07);
      const big = clusters.filter((c) => c.r * this.view.scale >= minR).slice(0, 40);
      for (const c of big) {
        const [sx, sy] = this.toScreen(c.x, c.y);
        if (sx < -100 || sx > this.w + 100 || sy < -40 || sy > this.h + 40) continue;
        const size = Math.max(11, Math.min(20, 9 + Math.log2(c.size) * 1.2));
        ctx.font = `700 ${size}px ${font}`;
        const tw = ctx.measureText(c.label).width;
        if (!occupy(sx - tw / 2, sy - size / 2, sx + tw / 2, sy + size / 2)) continue;
        halo(c.label, sx, sy, size, 700, this.theme.clusterLabel, ca);
      }
    }
    // node labels: candidates with lz ≤ current level in the viewport, by importance, no overlaps, within budget
    const budget = this.opts.labelBudget;
    if (budget <= 0) { ctx.globalAlpha = 1; return; }
    const lzMax = Math.floor(Math.max(0, zReal) + 0.25);
    const [wx0, wy1] = this.toWorld(0, 0), [wx1, wy0] = this.toWorld(this.w, this.h);
    const c0x = Math.max(0, Math.floor((wx0 - this.gx0) / this.gsize)), c1x = Math.min(GRID - 1, Math.floor((wx1 - this.gx0) / this.gsize));
    const c0y = Math.max(0, Math.floor((wy0 - this.gx0) / this.gsize)), c1y = Math.min(GRID - 1, Math.floor((wy1 - this.gx0) / this.gsize));
    // candidates: from the per-level lists when the view is wide (few labelable nodes vs. many in view),
    // from the grid buckets under the view when zoomed in
    if (!this.labelLevels) {
      const lv: number[][] = Array.from({ length: Math.max(1, this.meta.zoom_levels) }, () => []);
      for (let i = 0; i < this.n; i++) if (this.lz[i] < lv.length) lv[this.lz[i]].push(i);
      for (const l of lv) l.sort((a, b) => this.imp[b] - this.imp[a]);
      this.labelLevels = lv;
    }
    let listed = 0;
    for (let l = 0; l <= Math.min(lzMax, this.labelLevels.length - 1); l++) listed += this.labelLevels[l].length;
    const inView = ((c1x - c0x + 1) * (c1y - c0y + 1)) / (GRID * GRID) * this.n;
    const cand: number[] = [];
    const ok = (i: number) => this.lz[i] <= lzMax && this.nz[i] <= z + 1e-6 && this.imp[i] >= cut;
    if (listed < inView) {
      for (let l = 0; l <= Math.min(lzMax, this.labelLevels.length - 1); l++) {
        for (const i of this.labelLevels[l]) {
          if (this.x[i] < wx0 || this.x[i] > wx1 || this.y[i] < wy0 || this.y[i] > wy1) continue;
          if (ok(i)) cand.push(i);
        }
      }
    } else {
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const b = this.buckets.get(cy * GRID + cx);
          if (!b) continue;
          for (const i of b) if (ok(i)) cand.push(i);
        }
      }
    }
    cand.sort((a, b) => this.imp[b] - this.imp[a]);
    let drawn = 0;
    const la = ca > 0.5 ? 0.85 : 1;
    for (const i of cand) {
      if (drawn >= budget) break;
      if (pinned.includes(i)) continue;
      const [sx, sy] = this.toScreen(this.x[i], this.y[i]);
      const size = 11 + Math.round(this.imp[i] * 2);
      ctx.font = `500 ${size}px ${font}`;
      const tw = ctx.measureText(this.labels[i]).width;
      const ly = sy - this.nodePx(i, zReal) / 2 - 8;
      if (!occupy(sx - tw / 2 - 2, ly - size / 2, sx + tw / 2 + 2, ly + size / 2)) continue;
      const dim = this.selected != null && (this.nodeState.array as Float32Array)[i] < 0.5 ? 0.25 : la;
      halo(this.labels[i], sx, ly, size, 500, this.theme.label, dim);
      drawn++;
    }
    ctx.globalAlpha = 1;
  }

  // ── input ───────────────────────────────────────────

  /** Node under a screen point (nearest within its drawn radius + 4px), or null. */
  pick(sx: number, sy: number): number | null {
    const zReal = Math.log2(this.view.scale / this.refScale);
    const zEff = zReal + this.bias + this.qualityBias;
    const z = Math.max(0, zEff);
    const cut = this.impCut(zEff);
    const [wx, wy] = this.toWorld(sx, sy);
    const reach = (this.opts.nodePx[1] * BOOST_MAX) / this.view.scale;
    const c0x = Math.max(0, Math.floor((wx - reach - this.gx0) / this.gsize)), c1x = Math.min(GRID - 1, Math.floor((wx + reach - this.gx0) / this.gsize));
    const c0y = Math.max(0, Math.floor((wy - reach - this.gx0) / this.gsize)), c1y = Math.min(GRID - 1, Math.floor((wy + reach - this.gx0) / this.gsize));
    let best: number | null = null, bestD = Infinity;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const b = this.buckets.get(cy * GRID + cx);
        if (!b) continue;
        for (const i of b) {
          if (!this.visibleAt(i, z, cut)) continue;
          const dx = (this.x[i] - wx) * this.view.scale, dy = (this.y[i] - wy) * this.view.scale;
          const d = Math.sqrt(dx * dx + dy * dy);
          const r = this.nodePx(i, zReal) / 2 + 4;
          if (d <= r && d - this.imp[i] * 2 < bestD) { best = i; bestD = d - this.imp[i] * 2; }
        }
      }
    }
    return best;
  }

  private setHover(i: number | null): void {
    if (i === this.hovered) return;
    const st = this.nodeState.array as Float32Array;
    if (this.hovered != null && st[this.hovered] === 1) st[this.hovered] = 0;
    this.hovered = i;
    if (i != null && st[i] === 0) { st[i] = 1; this.marked.push(i); }
    this.nodeState.needsUpdate = true;
    this.canvas.style.cursor = i != null ? "pointer" : this.dragging ? "grabbing" : "grab";
    this.opts.onHover?.(i);
    this.requestRender();
  }

  private bindInput(): void {
    const el = this.canvas;
    el.style.cursor = "grab";
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let hoverPending = false;
    let lastMove: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      this.downAt = { ...p, t: performance.now() };
      this.anim = null;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener("pointermove", (e) => {
      const p = local(e);
      const prev = this.pointers.get(e.pointerId);
      if (prev) {
        if (this.pointers.size === 2) {
          this.pointers.set(e.pointerId, p);
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinchDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinchDist);
          this.pinchDist = d;
          return;
        }
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (!this.dragging && this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > 4) {
          this.dragging = true;
          el.style.cursor = "grabbing";
        }
        if (this.dragging) {
          this.view.x -= dx / this.view.scale;
          this.view.y += dy / this.view.scale;
          this.requestRender();
        }
        this.pointers.set(e.pointerId, p);
        return;
      }
      // hover: at most once per frame, never while dragging
      lastMove = p;
      if (hoverPending) return;
      hoverPending = true;
      requestAnimationFrame(() => {
        hoverPending = false;
        if (lastMove && !this.dragging) this.setHover(this.pick(lastMove.x, lastMove.y));
      });
    });
    const end = (e: PointerEvent) => {
      const p = local(e);
      const wasDrag = this.dragging;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        el.style.cursor = this.hovered != null ? "pointer" : "grab";
        if (!wasDrag && this.downAt && performance.now() - this.downAt.t < 600 && e.type === "pointerup") {
          const hit = this.pick(p.x, p.y);
          this.select(hit);
          this.opts.onSelect?.(hit);
        }
        this.downAt = null;
        this.requestRender();
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", () => { if (!this.pointers.size) this.setHover(null); });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      this.zoomAt(p.x, p.y, f);
    }, { passive: false });
    el.addEventListener("dblclick", (e) => {
      const p = local(e);
      this.anim = null;
      const [wx, wy] = this.toWorld(p.x, p.y);
      this.setView({ x: wx, y: wy, scale: this.view.scale * 2 }, true);
    });
  }

  private zoomAt(sx: number, sy: number, f: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    const min = this.fitScale * 0.5, max = this.refScale * 2 ** (this.meta.zoom_levels + 3);
    const s = Math.max(min, Math.min(max, this.view.scale * f));
    this.view.scale = s;
    // keep the world point under the cursor fixed
    this.view.x = wx - (sx - this.w / 2) / s;
    this.view.y = wy + (sy - this.h / 2) / s;
    this.requestRender();
  }

  /** PNG of the current view (WebGL + labels). */
  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement("canvas");
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.drawImage(this.labelCanvas, 0, 0);
    return out.toDataURL("image/png");
  }

  destroy(): void {
    this.destroyed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    this.nodeGeo.dispose(); this.edgeGeo.dispose(); this.nodeMat.dispose(); this.edgeMat.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.labelCanvas.remove();
  }
}
