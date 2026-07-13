/**
 * Node rendering: InstancedMesh with custom celestial body shader.
 * All nodes are rendered in a single GPU draw call.
 */
import * as THREE from "three";
import type { GraphNode } from "../types";
import type { ResolvedTheme } from "../themes/resolve-theme";

/** Vertex shader: instance transform + object-space surface point + per-instance seed */
const NODE_VERTEX_SHADER = /* glsl */ `
  attribute float aSeed;
  varying vec3 vObjPos;
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
    // Object-space surface direction (unit sphere) — stable per-planet pattern
    // regardless of the instance's world position, so the procedural surface
    // "sticks" to the body and rotates with it (see uTime spin in the fragment).
    vObjPos = normalize(position);

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
 * Fragment shader: planetary body.
 * Day/night terminator + procedural surface bands (self-rotating) + atmospheric
 * Fresnel rim (bloom picks it up as a glowing halo) + specular star-glint.
 */
const NODE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlowIntensity;
  uniform float uTime;
  varying vec3 vObjPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vSeed;

  float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
  mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,s, 0.,1.,0., -s,0.,c); }
  mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,-s, 0.,s,c); }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    float NdotV = max(dot(n, v), 0.0);
    vec3 base = vColor;

    // Procedural surface — banded fbm + mottled continents, spinning over time.
    // Speed + tilt + noise offset all varied per-instance by aSeed.
    float spin = uTime * (0.04 + 0.05 * fract(vSeed * 1.7)) + vSeed * 6.2831;
    vec3 sN = rotX(vSeed * 0.7) * rotY(spin) * vObjPos;
    float bands = fbm(vec3(sN.x * 2.1, sN.y * 7.0, sN.z * 2.1) + vSeed * 9.0);
    float mottle = fbm(sN * 4.6 + vSeed * 3.0);
    float surf = smoothstep(0.27, 0.82, mix(bands, mottle, 0.45));
    vec3 albedo = mix(base * 0.42, mix(base, vec3(1.0), 0.32), surf);

    // Day/night terminator — a single directional star light.
    vec3 L = normalize(vec3(0.5, 0.55, 0.62));
    float ndl = dot(n, L);
    float day = smoothstep(-0.12, 0.42, ndl);
    vec3 lit = albedo * (0.10 + day);

    // Specular star-glint on the day side.
    vec3 H = normalize(L + v);
    float spec = pow(max(dot(n, H), 0.0), 36.0) * day * 0.5;

    // Atmosphere: Fresnel rim in a brightened hue → glowing halo through bloom.
    float fresnel = pow(1.0 - NdotV, 3.0);
    vec3 atmo = (base + vec3(0.12)) * 1.7;

    vec3 color = lit;
    color += vec3(spec);
    color += atmo * fresnel * 0.9;
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
    uniforms: {
      uGlowIntensity: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: NODE_VERTEX_SHADER,
    fragmentShader: NODE_FRAGMENT_SHADER,
    transparent: false,
    depthWrite: true,
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
