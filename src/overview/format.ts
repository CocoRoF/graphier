/**
 * Overview chunk format (GNC1): the binary layout produced by a server-side snapshot builder.
 *
 *   header   "GNC1" · u32 nodeCount · u32 edgeCount · u32 start (global index of the first node)
 *   nodes    f32 x[n] · f32 y[n] · f32 importance[n] · u32 ref[n] · u16 cluster[n] · u8 nz[n] · u8 lz[n] · u8 lang[n]
 *   (pad to 4 bytes)
 *   edges    u32 src[m] · u32 dst[m] (global node indices) · u8 ez[m] · u8 weight[m]
 *
 * nz: the zoom level from which a node is drawn (level 0 = whole graph at the reference scale, each level ×2).
 * lz: the zoom level from which its label may be drawn without collisions (255 = never).
 * ez: the zoom level from which an edge is drawn (≥ both endpoints' nz, raised for weak edges).
 * Chunks are ordered by nz, so a client can stop after the chunks its device budget allows.
 */

export interface OverviewChunk {
  /** Global index of the first node in this chunk. */
  start: number;
  x: Float32Array;
  y: Float32Array;
  /** Importance 0..1 (drives size and label priority). */
  imp: Float32Array;
  /** Caller's id for each node (e.g. a database id). */
  ref: Uint32Array;
  cluster: Uint16Array;
  nz: Uint8Array;
  lz: Uint8Array;
  /** Category index (e.g. language); 0 = none. */
  lang: Uint8Array;
  src: Uint32Array;
  dst: Uint32Array;
  ez: Uint8Array;
  /** Edge weight 0..255. */
  w: Uint8Array;
  /** Node labels, aligned with the node arrays. */
  labels: string[];
  /** A secondary number per node (e.g. stars) for tooltips. */
  sub: number[];
}

export interface OverviewCluster {
  id: number;
  x: number;
  y: number;
  r: number;
  size: number;
  label: string;
}

export interface OverviewMeta {
  /** Total node count across all chunks (buffer capacity). */
  nodes: number;
  /** Total edge count across all chunks (buffer capacity). */
  edges: number;
  /** Layout half-extent: coordinates lie within [-span, span]. */
  span: number;
  /** Pixels that the whole span covers at zoom level 0 (the scale nz/lz were computed for). */
  view_px: number;
  zoom_levels: number;
  clusters?: OverviewCluster[];
}

const MAGIC = 0x31434e47; // "GNC1" little-endian

/** Decode one GNC1 chunk. `extra` carries the labels/sub arrays that travel as JSON beside the binary. */
export function decodeChunk(buf: ArrayBuffer, extra: { label?: string[]; sub?: number[] } = {}): OverviewChunk {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("graphier: not a GNC1 overview chunk");
  const n = dv.getUint32(4, true);
  const m = dv.getUint32(8, true);
  const start = dv.getUint32(12, true);
  let o = 16;
  const f32 = () => { const a = new Float32Array(buf, o, n); o += n * 4; return a; };
  const x = f32(), y = f32(), imp = f32();
  const ref = new Uint32Array(buf, o, n); o += n * 4;
  const cluster = new Uint16Array(buf, o, n); o += n * 2;
  const nz = new Uint8Array(buf, o, n); o += n;
  const lz = new Uint8Array(buf, o, n); o += n;
  const lang = new Uint8Array(buf, o, n); o += n;
  o += (4 - (o % 4)) % 4;
  const src = new Uint32Array(buf, o, m); o += m * 4;
  const dst = new Uint32Array(buf, o, m); o += m * 4;
  const ez = new Uint8Array(buf, o, m); o += m;
  const w = new Uint8Array(buf, o, m);
  return { start, x, y, imp, ref, cluster, nz, lz, lang, src, dst, ez, w,
           labels: extra.label ?? new Array(n).fill(""), sub: extra.sub ?? new Array(n).fill(0) };
}
