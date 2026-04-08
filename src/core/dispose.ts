/**
 * Three.js resource disposal utilities.
 */
import * as THREE from "three";

export function disposeObject(obj: THREE.Object3D | null | undefined): void {
  if (!obj) return;
  const mesh = obj as THREE.Mesh;
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose());
    } else {
      mesh.material.dispose();
    }
  }
  if (obj.children) {
    [...obj.children].forEach(disposeObject);
  }
}
