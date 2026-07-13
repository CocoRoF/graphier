/**
 * Node rendering: InstancedMesh with custom celestial body shader.
 * All nodes are rendered in a single GPU draw call.
 */
import * as THREE from "three";
import type { GraphNode } from "../types";
import type { ResolvedTheme } from "../themes/resolve-theme";

/** Vertex shader: instance transform + view normal / view dir + per-instance seed */
const NODE_VERTEX_SHADER = /* glsl */ `
  attribute float aSeed;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif
    vSeed = aSeed;

    vec4 localPos = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
    #endif
    vec4 mvPosition = modelViewMatrix * localPos;

    vec3 n = normal;
    #ifdef USE_INSTANCING
      n = mat3(instanceMatrix) * n;
    #endif
    vNormal = normalize(normalMatrix * n);
    vViewDir = normalize(-mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader: glowing ring / outline node.
 * The sphere is rendered as a bright hollow ring — a crisp stroke just inside
 * the silhouette plus a soft outward glow (bloom-lit). Because a sphere's
 * silhouette is always a camera-facing circle, this reads as a clean outlined
 * disc from any angle. The interior is (almost) transparent so the node is a
 * ring, not a filled body. A gentle per-node pulse keeps the glow alive.
 */
const NODE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlowIntensity;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    float NdotV = clamp(dot(n, v), 0.0, 1.0);
    // Screen-space radius on the projected disc: 0 at centre → 1 at silhouette.
    float rho = sqrt(max(0.0, 1.0 - NdotV * NdotV));
    vec3 base = vColor;

    // Crisp constant-width outline stroke centred at ~85% radius, plus a soft
    // glow that blooms outward toward the rim.
    float band   = abs(rho - 0.85);
    float stroke = 1.0 - smoothstep(0.02, 0.15, band);
    float glow   = smoothstep(0.42, 1.0, rho);
    // Gentle per-node breathing so the glow shimmers rather than sits static.
    float pulse  = 0.85 + 0.15 * sin(uTime * 1.1 + vSeed * 6.2831);
    float fill   = 0.04; // a whisper of interior tint — not a hard hole

    vec3 col = base * (1.9 * stroke + glow * 0.6 * pulse + fill);
    col *= uGlowIntensity;

    float alpha = clamp(stroke * 1.25 + glow * 0.35 + fill, 0.0, 1.0);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export interface NodeMeshResult {
  mesh: THREE.InstancedMesh;
  material: THREE.ShaderMaterial;
  scales: Float32Array;
}

/** Compute node scales from val range */
export function computeNodeScales(
  nodes: GraphNode[],
  minSize: number,
  maxSize: number
): Float32Array {
  const nc = nodes.length;
  let vMin = Infinity, vMax = -Infinity;
  for (const n of nodes) {
    const v = n.val ?? 1;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  if (!isFinite(vMin)) vMin = 1;
  if (!isFinite(vMax)) vMax = 1;

  const scales = new Float32Array(nc);
  for (let i = 0; i < nc; i++) {
    const raw = nodes[i].val ?? 1;
    const t = vMax > vMin ? (raw - vMin) / (vMax - vMin) : 0;
    scales[i] = minSize + t * (maxSize - minSize);
  }
  return scales;
}

/** Create the InstancedMesh for all nodes */
export function createNodeMesh(
  nodes: GraphNode[],
  scales: Float32Array,
  theme: ResolvedTheme
): NodeMeshResult {
  const nc = nodes.length;

  // Adaptive geometry quality. The ring is drawn from the sphere's silhouette,
  // so small graphs get extra segments for a perfectly smooth outline.
  const segments = nc > 50000 ? 8 : nc > 15000 ? 12 : nc > 3000 ? 20 : 32;
  const rings = nc > 50000 ? 6 : nc > 15000 ? 8 : nc > 3000 ? 12 : 20;
  const sphereGeo = new THREE.SphereGeometry(1, segments, rings);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGlowIntensity: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: NODE_VERTEX_SHADER,
    fragmentShader: NODE_FRAGMENT_SHADER,
    // Hollow glowing ring: blend the stroke + glow over the scene, and don't
    // write depth so overlapping rings / edges show through the open centres.
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  // Per-instance seed → each planet gets a unique surface pattern, spin speed
  // and axial tilt. Stable (hashed from index) so a rebuild looks the same.
  const seeds = new Float32Array(nc);
  for (let i = 0; i < nc; i++) {
    const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
    seeds[i] = s - Math.floor(s);
  }
  sphereGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));

  const mesh = new THREE.InstancedMesh(sphereGeo, material, nc);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Set initial colors from theme
  const tmpColor = new THREE.Color();
  for (let i = 0; i < nc; i++) {
    tmpColor.set(theme.nodeColor(nodes[i].type));
    mesh.setColorAt(i, tmpColor);
  }
  mesh.instanceColor!.needsUpdate = true;

  // Set initial random positions
  const tmpMatrix = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  for (let i = 0; i < nc; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 100 + Math.random() * 300;
    tmpPos.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    const sc = scales[i];
    tmpScale.set(sc, sc, sc);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(i, tmpMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  return { mesh, material, scales };
}

/** Update instance matrices from position array */
export function updateNodePositions(
  mesh: THREE.InstancedMesh,
  positions: Float32Array,
  scales: Float32Array,
  nodeCount: number,
  hidden?: Uint8Array | null
): void {
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();

  for (let i = 0; i < nodeCount; i++) {
    pos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    // Hidden nodes collapse to near-zero scale: invisible, un-raycastable,
    // but the instance stays allocated so indices never shift and the
    // layout keeps running — showing them again is just a matrix update.
    const sc = hidden && hidden[i] ? 1e-4 : scales[i];
    scale.set(sc, sc, sc);
    mat.compose(pos, quat, scale);
    mesh.setMatrixAt(i, mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
