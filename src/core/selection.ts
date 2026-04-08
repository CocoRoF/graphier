/**
 * Node selection and N-hop highlight logic.
 * Performs BFS from selected node to compute highlight gradient.
 */
import * as THREE from "three";
import type { GraphNode, GraphLink } from "../types";
import type { ResolvedTheme } from "../themes/resolve-theme";

/** Build adjacency map from links */
export function buildAdjacencyMapFromLinks(
  links: GraphLink[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
    const t = typeof l.target === "object" ? (l.target as any).id : l.target;
    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    adj.get(s)!.push(t);
    adj.get(t)!.push(s);
  }
  return adj;
}

/** BFS to find nodes within N hops of a root node */
export function computeHighlightSet(
  rootId: string,
  adjacencyMap: Map<string, string[]>,
  maxHops: number
): Map<string, number> {
  const visited = new Map<string, number>();
  visited.set(rootId, 0);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dist = visited.get(current)!;
    if (dist >= maxHops) continue;
    for (const nb of adjacencyMap.get(current) ?? []) {
      if (!visited.has(nb)) {
        visited.set(nb, dist + 1);
        queue.push(nb);
      }
    }
  }
  return visited;
}

/** Apply selection highlight to node colors (dim non-selected, brighten selected) */
export function applyNodeHighlight(
  nodesMesh: THREE.InstancedMesh,
  nodes: GraphNode[],
  selectedNodeId: string | null,
  highlightSet: Map<string, number> | null,
  theme: ResolvedTheme
): void {
  const nc = nodes.length;
  const tmpColor = new THREE.Color();
  const brightTmp = new THREE.Color();

  for (let i = 0; i < nc; i++) {
    const node = nodes[i];
    const baseColor = theme.nodeColor(node.type);
    const brightColor = theme.nodeColorBright(node.type);

    if (!highlightSet) {
      // Normal state
      tmpColor.set(baseColor);
    } else if (node.id === selectedNodeId) {
      // Selected — near-white glow
      tmpColor.set(brightColor);
      brightTmp.setRGB(1, 1, 1);
      tmpColor.lerp(brightTmp, 0.5);
    } else if (highlightSet.has(node.id)) {
      const hop = highlightSet.get(node.id)!;
      if (hop === 1) {
        tmpColor.set(brightColor);
      } else if (hop === 2) {
        tmpColor.set(baseColor);
        brightTmp.set(brightColor);
        tmpColor.lerp(brightTmp, 0.4);
      } else {
        tmpColor.set(baseColor).multiplyScalar(0.7);
      }
    } else {
      // Dimmed
      tmpColor.set(baseColor).multiplyScalar(0.12);
    }

    nodesMesh.setColorAt(i, tmpColor);
  }
  if (nodesMesh.instanceColor) nodesMesh.instanceColor.needsUpdate = true;

  // Boost glow for highlights
  const mat = nodesMesh.material as THREE.ShaderMaterial;
  if (mat.uniforms?.uGlowIntensity) {
    mat.uniforms.uGlowIntensity.value = highlightSet ? 1.15 : 1.0;
  }
}

/** Apply selection highlight to edge colors */
export function applyEdgeHighlight(
  edgesMesh: THREE.LineSegments,
  links: GraphLink[],
  edgeNodeIndices: [number, number][],
  edgeLinkIndices: number[],
  highlightSet: Map<string, number> | null,
  edgeOpacity: number,
  nodeCount: number,
  theme: ResolvedTheme
): void {
  const colorAttr = edgesMesh.geometry.attributes.color;
  if (!colorAttr) return;

  const colorArr = colorAttr.array as Float32Array;
  const validCount = edgeNodeIndices.length;
  const tmpColor = new THREE.Color();

  for (let i = 0; i < validCount; i++) {
    const origIdx = edgeLinkIndices[i];
    const link = links[origIdx];
    const sId =
      typeof link?.source === "object" ? (link.source as any).id : link?.source;
    const tId =
      typeof link?.target === "object" ? (link.target as any).id : link?.target;

    if (!highlightSet) {
      tmpColor.set(theme.linkColor(link?.type));
    } else if (highlightSet.has(sId) && highlightSet.has(tId)) {
      const maxHopVal = Math.max(highlightSet.get(sId)!, highlightSet.get(tId)!);
      tmpColor.set(theme.linkColor(link?.type));
      if (maxHopVal <= 1) {
        tmpColor.multiplyScalar(1.8);
        tmpColor.r = Math.min(tmpColor.r, 1);
        tmpColor.g = Math.min(tmpColor.g, 1);
        tmpColor.b = Math.min(tmpColor.b, 1);
      } else if (maxHopVal === 2) {
        tmpColor.multiplyScalar(1.2);
      }
    } else {
      tmpColor.setRGB(0.03, 0.03, 0.06);
    }

    colorArr[i * 6 + 0] = tmpColor.r;
    colorArr[i * 6 + 1] = tmpColor.g;
    colorArr[i * 6 + 2] = tmpColor.b;
    colorArr[i * 6 + 3] = tmpColor.r;
    colorArr[i * 6 + 4] = tmpColor.g;
    colorArr[i * 6 + 5] = tmpColor.b;
  }
  colorAttr.needsUpdate = true;

  // Adaptive edge opacity
  (edgesMesh.material as THREE.LineBasicMaterial).opacity = highlightSet
    ? Math.min(edgeOpacity * 1.5, 0.6)
    : nodeCount > 15000
      ? 0.08
      : nodeCount > 5000
        ? 0.12
        : edgeOpacity;
}

/** Create selection ring (double ring for strong visual) */
export function createSelectionRing(): THREE.Group {
  const group = new THREE.Group();

  const ringGeo = new THREE.RingGeometry(1.2, 1.5, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(ringGeo, ringMat));

  const outerGeo = new THREE.RingGeometry(1.6, 2.2, 48);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(outerGeo, outerMat));

  group.visible = false;
  return group;
}

/** Update selection ring position and color */
export function updateSelectionRing(
  ring: THREE.Group,
  selectedNodeId: string | null,
  nodeIdToIndex: Map<string, number>,
  positions: Float32Array | null,
  scales: Float32Array | null,
  theme: ResolvedTheme,
  nodeType?: string
): void {
  if (!selectedNodeId || !positions) {
    ring.visible = false;
    return;
  }

  const idx = nodeIdToIndex.get(selectedNodeId);
  if (idx === undefined || !scales) {
    ring.visible = false;
    return;
  }

  ring.position.set(
    positions[idx * 3],
    positions[idx * 3 + 1],
    positions[idx * 3 + 2]
  );
  const sc = scales[idx] * 1.6;
  ring.scale.set(sc, sc, sc);
  ring.visible = true;

  const ringColor = theme.nodeColorBright(nodeType);
  ring.children.forEach((child) => {
    (child as THREE.Mesh).material &&
      ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(
        ringColor
      );
  });
}
