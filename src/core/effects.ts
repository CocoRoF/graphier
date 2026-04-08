/**
 * Visual effects: star field, bloom, fog.
 */
import * as THREE from "three";

/** Create a background star field of random points on a sphere */
export function createStarField(count: number, radius: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.4 + Math.random() * 0.6);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const b = 0.5 + Math.random() * 0.5;
    colors[i * 3] = b * (0.8 + Math.random() * 0.2);
    colors[i * 3 + 1] = b * (0.85 + Math.random() * 0.15);
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      depthWrite: false,
    })
  );
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
