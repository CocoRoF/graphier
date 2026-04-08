/**
 * Edge rendering: LineSegments with per-edge coloring.
 * All edges rendered in a single GPU draw call.
 */
import * as THREE from "three";
import type { GraphLink } from "../types";
import type { ResolvedTheme } from "../themes/resolve-theme";

export interface EdgeMeshResult {
  mesh: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  positionArray: Float32Array;
  colorArray: Float32Array;
  /** Maps valid edge index → [sourceNodeIdx, targetNodeIdx] */
  edgeNodeIndices: [number, number][];
  /** Maps valid edge index → original link index */
  edgeLinkIndices: number[];
}

/**
 * Build edge index mappings:
 * - edgeNodeIndices: [srcIdx, tgtIdx] for each valid edge
 * - edgeLinkIndices: original link index for each valid edge
 */
export function buildEdgeMappings(
  links: GraphLink[],
  nodeIdToIndex: Map<string, number>
): { edgeNodeIndices: [number, number][]; edgeLinkIndices: number[] } {
  const edgeNodeIndices: [number, number][] = [];
  const edgeLinkIndices: number[] = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const si = nodeIdToIndex.get(
      typeof link.source === "object"
        ? (link.source as any).id
        : link.source
    );
    const ti = nodeIdToIndex.get(
      typeof link.target === "object"
        ? (link.target as any).id
        : link.target
    );
    if (si !== undefined && ti !== undefined) {
      edgeNodeIndices.push([si, ti]);
      edgeLinkIndices.push(i);
    }
  }

  return { edgeNodeIndices, edgeLinkIndices };
}

/** Create LineSegments mesh for all edges */
export function createEdgeMesh(
  links: GraphLink[],
  edgeNodeIndices: [number, number][],
  edgeLinkIndices: number[],
  nodeCount: number,
  edgeOpacity: number,
  theme: ResolvedTheme
): EdgeMeshResult {
  const validEdgeCount = edgeNodeIndices.length;
  const positionArray = new Float32Array(validEdgeCount * 6);
  const colorArray = new Float32Array(validEdgeCount * 6);

  const tmpC = new THREE.Color();
  for (let i = 0; i < validEdgeCount; i++) {
    const origIdx = edgeLinkIndices[i];
    tmpC.set(theme.linkColor(links[origIdx]?.type));
    colorArray[i * 6 + 0] = tmpC.r;
    colorArray[i * 6 + 1] = tmpC.g;
    colorArray[i * 6 + 2] = tmpC.b;
    colorArray[i * 6 + 3] = tmpC.r;
    colorArray[i * 6 + 4] = tmpC.g;
    colorArray[i * 6 + 5] = tmpC.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positionArray, 3).setUsage(THREE.DynamicDrawUsage)
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colorArray, 3).setUsage(THREE.DynamicDrawUsage)
  );

  const adaptiveOpacity =
    nodeCount > 15000 ? 0.1 : nodeCount > 5000 ? 0.15 : edgeOpacity;

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: adaptiveOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.LineSegments(geometry, material);

  return {
    mesh,
    geometry,
    positionArray,
    colorArray,
    edgeNodeIndices,
    edgeLinkIndices,
  };
}

/** Update edge endpoint positions from node position array */
export function updateEdgePositions(
  positionArray: Float32Array,
  nodePositions: Float32Array,
  edgeNodeIndices: [number, number][],
  geometry: THREE.BufferGeometry
): void {
  const count = edgeNodeIndices.length;
  for (let i = 0; i < count; i++) {
    const [si, ti] = edgeNodeIndices[i];
    positionArray[i * 6 + 0] = nodePositions[si * 3];
    positionArray[i * 6 + 1] = nodePositions[si * 3 + 1];
    positionArray[i * 6 + 2] = nodePositions[si * 3 + 2];
    positionArray[i * 6 + 3] = nodePositions[ti * 3];
    positionArray[i * 6 + 4] = nodePositions[ti * 3 + 1];
    positionArray[i * 6 + 5] = nodePositions[ti * 3 + 2];
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.computeBoundingSphere();
}
