/**
 * Node rendering: InstancedMesh with custom celestial body shader.
 * All nodes are rendered in a single GPU draw call.
 */
import * as THREE from "three";
import type { GraphNode } from "../types";
import type { ResolvedTheme } from "../themes/resolve-theme";

/** Vertex shader: instance transform + color passthrough */
const NODE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vColor;

  void main() {
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif

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

/** Fragment shader: Fresnel rim glow + subsurface scatter */
const NODE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlowIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vColor;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    float NdotV = max(dot(n, v), 0.0);

    // Fresnel rim glow
    float fresnel = pow(1.0 - NdotV, 3.0);
    // Core gradient — brighter center
    float core = smoothstep(0.0, 1.0, NdotV);
    // Soft directional light
    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.6));
    float diffuse = max(dot(n, lightDir), 0.0) * 0.25 + 0.75;

    // Color composition
    vec3 baseColor = vColor;
    vec3 centerColor = mix(baseColor, vec3(1.0), 0.35);
    vec3 edgeColor = baseColor * 1.3;
    vec3 bodyColor = mix(edgeColor, centerColor, core) * diffuse;

    // Rim glow (bloom picks this up for halo)
    vec3 rimColor = (baseColor + vec3(0.25)) * 1.6;
    // Subsurface scatter approximation
    float scatter = pow(NdotV, 0.4) * 0.15;

    vec3 color = bodyColor * 0.85;
    color += rimColor * fresnel * 0.7;
    color += baseColor * scatter;
    color *= uGlowIntensity;

    gl_FragColor = vec4(color, 1.0);
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

  // Adaptive geometry quality
  const segments = nc > 50000 ? 8 : nc > 15000 ? 12 : 16;
  const rings = nc > 50000 ? 6 : nc > 15000 ? 8 : 12;
  const sphereGeo = new THREE.SphereGeometry(1, segments, rings);

  const material = new THREE.ShaderMaterial({
    uniforms: { uGlowIntensity: { value: 1.0 } },
    vertexShader: NODE_VERTEX_SHADER,
    fragmentShader: NODE_FRAGMENT_SHADER,
    transparent: false,
    depthWrite: true,
  });

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
  nodeCount: number
): void {
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();

  for (let i = 0; i < nodeCount; i++) {
    pos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const sc = scales[i];
    scale.set(sc, sc, sc);
    mat.compose(pos, quat, scale);
    mesh.setMatrixAt(i, mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
