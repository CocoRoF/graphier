/**
 * Sprite-based label system with distance/val priority culling.
 * Uses a fixed pool of sprites to avoid per-frame allocation.
 */
import * as THREE from "three";
import type { GraphNode } from "../types";
import type { ResolvedTheme } from "../themes/resolve-theme";

const LABEL_UPDATE_MS = 250;

export interface LabelState {
  group: THREE.Group;
  sprites: THREE.Sprite[];
  textureCache: Map<string, { texture: THREE.CanvasTexture; aspect: number }>;
  lastUpdate: number;
}

/** Create the label sprite pool */
export function createLabelSystem(maxLabels: number): LabelState {
  const group = new THREE.Group();
  group.renderOrder = 999;
  const sprites: THREE.Sprite[] = [];

  for (let i = 0; i < maxLabels; i++) {
    const mat = new THREE.SpriteMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    sprites.push(sprite);
  }

  return {
    group,
    sprites,
    textureCache: new Map(),
    lastUpdate: 0,
  };
}

/** Default label text extraction */
function defaultLabelText(node: GraphNode): string {
  const label = node.label ?? node.id ?? "";
  return label.length > 30 ? label.substring(0, 27) + "\u2026" : label;
}

/** Get or create a cached canvas texture for a label */
function getOrCreateTexture(
  cache: LabelState["textureCache"],
  nodeId: string,
  text: string,
  color: string
): { texture: THREE.CanvasTexture; aspect: number } {
  if (cache.has(nodeId)) return cache.get(nodeId)!;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 64;
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  const pw = Math.ceil(metrics.width) + 32;
  const ph = fontSize + 24;
  canvas.width = pw;
  canvas.height = ph;

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  ctx.fillText(text, pw / 2, ph / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const aspect = pw / ph;
  const entry = { texture, aspect };
  cache.set(nodeId, entry);

  // Evict old entries if cache is too large
  if (cache.size > 500) {
    const iter = cache.keys();
    for (let i = 0; i < 100; i++) {
      const key = iter.next().value;
      if (key === undefined) break;
      const old = cache.get(key);
      if (old?.texture) old.texture.dispose();
      cache.delete(key);
    }
  }
  return entry;
}

/** Update visible labels based on camera distance and node priority */
export function updateLabels(
  state: LabelState,
  nodes: GraphNode[],
  positions: Float32Array | null,
  scales: Float32Array | null,
  camera: THREE.PerspectiveCamera,
  theme: ResolvedTheme,
  showLabels: boolean,
  labelScale: number,
  labelThreshold: number,
  maxLabels: number,
  labelFormatter?: (node: GraphNode) => string
): void {
  if (
    !positions ||
    nodes.length === 0 ||
    !showLabels
  ) {
    for (const sp of state.sprites) sp.visible = false;
    return;
  }

  const now = performance.now();
  if (now - state.lastUpdate < LABEL_UPDATE_MS) return;
  state.lastUpdate = now;

  const nc = nodes.length;
  const camPos = camera.position;
  const maxDist = 150 + labelThreshold * 3000;
  const maxDistSq = maxDist * maxDist;

  // Find candidate nodes within range
  const candidates: { idx: number; distSq: number; val: number }[] = [];
  for (let i = 0; i < nc; i++) {
    const dx = positions[i * 3] - camPos.x;
    const dy = positions[i * 3 + 1] - camPos.y;
    const dz = positions[i * 3 + 2] - camPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < maxDistSq) {
      candidates.push({ idx: i, distSq, val: nodes[i].val ?? 1 });
    }
  }

  // Sort by priority: higher val + closer distance
  candidates.sort((a, b) => b.val / b.distSq - a.val / a.distSq);

  const count = Math.min(candidates.length, maxLabels);

  for (let i = 0; i < count; i++) {
    const c = candidates[i];
    const node = nodes[c.idx];
    const sprite = state.sprites[i];

    const text = labelFormatter ? labelFormatter(node) : defaultLabelText(node);
    const color = theme.nodeColorBright(node.type);
    const entry = getOrCreateTexture(state.textureCache, node.id, text, color);

    if (sprite.material.map !== entry.texture) {
      sprite.material.map = entry.texture;
      sprite.material.needsUpdate = true;
    }
    sprite.material.opacity = 0.9;

    const nodeScale = scales?.[c.idx] ?? 5;
    sprite.position.set(
      positions[c.idx * 3],
      positions[c.idx * 3 + 1] + nodeScale + 4,
      positions[c.idx * 3 + 2]
    );

    const baseH = 5 * labelScale;
    sprite.scale.set(baseH * entry.aspect, baseH, 1);
    sprite.visible = true;
  }

  // Hide unused sprites
  for (let i = count; i < state.sprites.length; i++) {
    state.sprites[i].visible = false;
  }
}

/** Dispose all label resources */
export function disposeLabelSystem(state: LabelState): void {
  for (const sp of state.sprites) {
    if (sp.material) (sp.material as THREE.SpriteMaterial).dispose();
  }
  for (const [, entry] of state.textureCache) {
    if (entry.texture) entry.texture.dispose();
  }
  state.textureCache.clear();
}
