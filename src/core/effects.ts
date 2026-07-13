/**
 * Visual effects: star field, nebula backdrop, fog.
 */
import * as THREE from "three";

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vColor = color;
    // Twinkle — per-star phase keeps them out of sync.
    float tw = 0.55 + 0.45 * sin(uTime * 1.8 + aPhase * 6.2831);
    vTw = tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Distance-attenuated size with a floor so far stars stay visible.
    gl_PointSize = aSize * uPixelRatio * (900.0 / max(-mv.z, 1.0)) * (0.7 + tw * 0.5);
    gl_PointSize = clamp(gl_PointSize, 0.6, 9.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float core = smoothstep(0.5, 0.0, d);
    float glow = smoothstep(0.5, 0.12, d) * 0.55;
    float a = core + glow;
    if (a < 0.01) discard;
    vec3 c = vColor * (0.65 + vTw * 0.7);
    gl_FragColor = vec4(c, a);
  }
`;

/** Create a shader-driven, twinkling background star field on a sphere shell. */
export function createStarField(count: number, radius: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = radius * (0.45 + Math.random() * 0.55);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Colour temperature: mostly ice-white, a few warm ambers, rare blue giants.
    const t = Math.random();
    if (t > 0.92) tmp.setRGB(0.7, 0.82, 1.0);        // blue-white giant
    else if (t > 0.72) tmp.setRGB(1.0, 0.88, 0.72);  // warm amber
    else tmp.setRGB(0.86, 0.91, 1.0);                // ice white
    const b = 0.55 + Math.random() * 0.45;
    colors[i * 3] = tmp.r * b;
    colors[i * 3 + 1] = tmp.g * b;
    colors[i * 3 + 2] = tmp.b * b;

    // A few "hero" stars are markedly larger.
    sizes[i] = t > 0.985 ? 3.0 + Math.random() * 2.0 : 0.7 + Math.random() * 1.3;
    phases[i] = Math.random();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = -50;
  return points;
}

const NEBULA_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uVoid;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uIntensity;
  varying vec3 vDir;

  float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }

  void main() {
    vec3 d = normalize(vDir);
    float t = uTime * 0.008;
    float f = fbm(d * 2.4 + vec3(0.0, t, 0.0));
    float f2 = fbm(d * 4.8 + vec3(4.0, -t * 1.3, 2.0));
    vec3 c = uVoid;
    c = mix(c, uColorA, smoothstep(0.35, 0.92, f) * 0.60 * uIntensity);
    c = mix(c, uColorB, smoothstep(0.50, 1.00, f2) * 0.45 * uIntensity);
    c = mix(c, uColorC, smoothstep(0.55, 1.00, f * f2) * 0.40 * uIntensity);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export interface NebulaColors {
  void: string;
  a: string;
  b: string;
  c: string;
  intensity?: number;
}

/**
 * A deep-space nebula backdrop — an inside-out sphere shaded with drifting fbm
 * clouds. Rendered first (renderOrder −100, depthWrite off) so it sits behind
 * the stars and graph without ever occluding them.
 */
export function createNebula(radius: number, colors: NebulaColors): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uVoid: { value: new THREE.Color(colors.void) },
      uColorA: { value: new THREE.Color(colors.a) },
      uColorB: { value: new THREE.Color(colors.b) },
      uColorC: { value: new THREE.Color(colors.c) },
      uIntensity: { value: colors.intensity ?? 1.0 },
    },
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return mesh;
}

/** Create exponential fog matching background color */
export function createFog(
  backgroundColor: number,
  density: number,
  nodeCount: number
): THREE.FogExp2 | null {
  if (density <= 0 || nodeCount >= 15000) return null;
  return new THREE.FogExp2(backgroundColor, density * 0.5);
}
