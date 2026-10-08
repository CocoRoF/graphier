/**
 * <OverviewGraph>: React wrapper around OverviewEngine for large precomputed networks.
 *
 * Pass `meta` once and `chunks` as they arrive (decoded with decodeChunk). The engine is created per `meta`
 * identity; new entries at the end of `chunks` are appended without rebuilding.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";

import { OverviewEngine, OVERVIEW_THEMES, type OverviewTheme, type OverviewView } from "./engine";
import type { OverviewChunk, OverviewMeta } from "./format";

export interface OverviewGraphProps {
  meta: OverviewMeta;
  chunks: OverviewChunk[];
  theme?: OverviewTheme | "paper" | "night";
  colorBy?: "cluster" | "category";
  /** +1 shows one more level of detail than the data's reference density, -1 one less. */
  zoomBias?: number;
  labelBudget?: number;
  fontFamily?: string;
  nodePx?: [number, number];
  /** Selected node index (controlled). Omit to let clicks select freely. */
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  onHover?: (index: number | null) => void;
  onView?: (view: OverviewView) => void;
  /** Fired when frames were slow and the engine lowered detail (level grows 1, 2, …). */
  onQuality?: (level: number) => void;
  className?: string;
  style?: CSSProperties;
  /** Accessible name for the canvas. */
  ariaLabel?: string;
}

export interface OverviewGraphRef {
  engine: OverviewEngine | null;
  flyTo: (index: number, minZoom?: number) => void;
  /** Fly to the node whose caller id is `ref`; returns its index or -1 when it is not loaded. */
  flyToRef: (ref: number, minZoom?: number) => number;
  select: (index: number | null) => void;
  fit: (animate?: boolean) => void;
  zoomBy: (factor: number) => void;
  getView: () => OverviewView | null;
  screenshot: () => string | null;
}

export const OverviewGraph = forwardRef<OverviewGraphRef, OverviewGraphProps>(function OverviewGraph(props, ref) {
  const { meta, chunks, className, style, ariaLabel } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<OverviewEngine | null>(null);
  const appended = useRef(0);
  const cb = useRef(props);
  cb.current = props;

  const resolveTheme = (t: OverviewGraphProps["theme"]): OverviewTheme =>
    typeof t === "string" ? OVERVIEW_THEMES[t] ?? OVERVIEW_THEMES.paper : t ?? OVERVIEW_THEMES.paper;

  // one engine per meta
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const p = cb.current;
    const engine = new OverviewEngine(host, {
      meta,
      theme: resolveTheme(p.theme),
      colorBy: p.colorBy ?? "cluster",
      zoomBias: p.zoomBias ?? 0,
      labelBudget: p.labelBudget ?? 60,
      fontFamily: p.fontFamily ?? "system-ui, sans-serif",
      nodePx: p.nodePx ?? [3, 16],
      onSelect: (i) => cb.current.onSelect?.(i),
      onHover: (i) => cb.current.onHover?.(i),
      onView: (v) => cb.current.onView?.(v),
      onQuality: (l) => cb.current.onQuality?.(l),
    });
    if (ariaLabel) engine.canvas.setAttribute("aria-label", ariaLabel);
    engine.canvas.setAttribute("role", "img");
    engineRef.current = engine;
    appended.current = 0;
    return () => {
      engine.destroy();
      engineRef.current = null;
      appended.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // append new chunks (in order); fit once the first chunk is in
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const first = appended.current === 0;
    while (appended.current < chunks.length) {
      e.append(chunks[appended.current]);
      appended.current++;
    }
    if (first && chunks.length) e.fit(false);
  }, [chunks, meta]);

  useEffect(() => { engineRef.current?.setTheme(resolveTheme(props.theme)); }, [props.theme]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engineRef.current?.setColorBy(props.colorBy ?? "cluster"); }, [props.colorBy]);
  useEffect(() => { engineRef.current?.setZoomBias(props.zoomBias ?? 0); }, [props.zoomBias]);
  useEffect(() => { engineRef.current?.setLabelBudget(props.labelBudget ?? 60); }, [props.labelBudget]);
  useEffect(() => {
    if (props.selected === undefined) return;
    const e = engineRef.current;
    if (e && e.selection !== props.selected) e.select(props.selected);
  }, [props.selected, chunks]);

  useImperativeHandle(ref, () => ({
    get engine() { return engineRef.current; },
    flyTo: (i, z) => engineRef.current?.flyTo(i, z),
    flyToRef: (r, z) => {
      const e = engineRef.current;
      if (!e) return -1;
      const i = e.indexOfRef(r);
      if (i >= 0) e.flyTo(i, z);
      return i;
    },
    select: (i) => engineRef.current?.select(i),
    fit: (a) => engineRef.current?.fit(a),
    zoomBy: (f) => engineRef.current?.zoomBy(f),
    getView: () => engineRef.current?.getView() ?? null,
    screenshot: () => engineRef.current?.screenshot() ?? null,
  }), []);

  return <div ref={hostRef} className={className} style={{ position: "relative", overflow: "hidden", ...style }} />;
});
