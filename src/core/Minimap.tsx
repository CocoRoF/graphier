/**
 * GraphMinimap — lightweight 2D-canvas overview of a NetworkGraph3D.
 *
 * Reads node buffers via ref.getGraphSnapshot() on a throttled rAF loop
 * (no second WebGL context, no React re-renders per frame), draws dots +
 * the camera's viewport rectangle, and pans the main camera on
 * click/drag. Designed for 2D layout mode; in 3D the viewport rectangle
 * is an approximation of the camera footprint on the z=0 plane.
 */
import { useEffect, useRef, type RefObject, type CSSProperties } from "react";
import type { NetworkGraph3DRef } from "../types";

export interface GraphMinimapProps {
  /** Ref to the NetworkGraph3D instance to mirror */
  graphRef: RefObject<NetworkGraph3DRef | null>;
  /** Canvas CSS width in px (default: 200) */
  width?: number;
  /** Canvas CSS height in px (default: 140) */
  height?: number;
  /** Background fill (default: transparent) */
  backgroundColor?: string;
  /** Viewport rectangle stroke color (default: "#94a3b8") */
  viewportColor?: string;
  /** Dot radius in px (default: 1.5) */
  dotRadius?: number;
  /** Redraw rate in frames per second (default: 15) */
  fps?: number;
  /** Fraction of canvas kept as padding around the graph (default: 0.08) */
  padding?: number;
  className?: string;
  style?: CSSProperties;
}

interface FitTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function GraphMinimap({
  graphRef,
  width = 200,
  height = 140,
  backgroundColor,
  viewportColor = "#94a3b8",
  dotRadius = 1.5,
  fps = 15,
  padding = 0.08,
  className,
  style,
}: GraphMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // World→canvas transform of the last drawn frame, for pointer mapping
  const fitRef = useRef<FitTransform | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    let raf = 0;
    let last = 0;
    const interval = 1000 / fps;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < interval) return;
      last = now;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      const snap = graphRef.current?.getGraphSnapshot();
      if (!snap || snap.count === 0) {
        fitRef.current = null;
        return;
      }
      const { positions, count, colors, hidden, selectedIndex } = snap;

      // Bounds over visible nodes (XY plane)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < count; i++) {
        if (hidden && hidden[i]) continue;
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (!isFinite(minX)) {
        fitRef.current = null;
        return;
      }

      const spanX = Math.max(maxX - minX, 1);
      const spanY = Math.max(maxY - minY, 1);
      const pad = Math.min(width, height) * padding;
      const scale = Math.min(
        (width - pad * 2) / spanX,
        (height - pad * 2) / spanY
      );
      // World y is up; canvas y is down → flip
      const offsetX = width / 2 - ((minX + maxX) / 2) * scale;
      const offsetY = height / 2 + ((minY + maxY) / 2) * scale;
      fitRef.current = { scale, offsetX, offsetY };

      // Nodes
      const r = dotRadius;
      for (let i = 0; i < count; i++) {
        if (hidden && hidden[i]) continue;
        const cx = positions[i * 3] * scale + offsetX;
        const cy = -positions[i * 3 + 1] * scale + offsetY;
        if (colors) {
          const cr = Math.min(255, Math.round(colors[i * 3] * 255));
          const cg = Math.min(255, Math.round(colors[i * 3 + 1] * 255));
          const cb = Math.min(255, Math.round(colors[i * 3 + 2] * 255));
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        } else {
          ctx.fillStyle = viewportColor;
        }
        const rad = i === selectedIndex ? r * 2 : r;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Viewport rectangle
      const vp = graphRef.current?.getViewportRect();
      if (vp) {
        const x = (vp.cx - vp.halfW) * scale + offsetX;
        const y = -(vp.cy + vp.halfH) * scale + offsetY;
        const w = vp.halfW * 2 * scale;
        const h = vp.halfH * 2 * scale;
        ctx.strokeStyle = viewportColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = viewportColor + "1a"; // ~10% alpha
        ctx.fillRect(x, y, w, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [graphRef, width, height, backgroundColor, viewportColor, dotRadius, fps, padding]);

  const panToPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const fit = fitRef.current;
    const canvas = canvasRef.current;
    if (!fit || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = (px - fit.offsetX) / fit.scale;
    const wy = -(py - fit.offsetY) / fit.scale;
    graphRef.current?.panTo(wx, wy, draggingRef.current ? 0 : 300);
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width,
        height,
        cursor: "pointer",
        touchAction: "none",
        display: "block",
        ...style,
      }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        panToPointer(e);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) panToPointer(e);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    />
  );
}
