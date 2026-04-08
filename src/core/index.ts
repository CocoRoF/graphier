export {
  createScene,
  initBloom,
  startAnimationLoop,
  setupResize,
} from "./scene-setup";
export type { SceneState } from "./scene-setup";

export {
  createNodeMesh,
  computeNodeScales,
  updateNodePositions,
} from "./node-mesh";
export type { NodeMeshResult } from "./node-mesh";

export {
  createEdgeMesh,
  buildEdgeMappings,
  updateEdgePositions,
} from "./edge-mesh";
export type { EdgeMeshResult } from "./edge-mesh";

export {
  createLabelSystem,
  updateLabels,
  disposeLabelSystem,
} from "./label-system";
export type { LabelState } from "./label-system";

export {
  animateCamera,
  zoomToFitPositions,
} from "./camera";

export {
  buildAdjacencyMapFromLinks,
  computeHighlightSet,
  applyNodeHighlight,
  applyEdgeHighlight,
  createSelectionRing,
  updateSelectionRing,
} from "./selection";

export { setupInteraction } from "./interaction";
export type { InteractionCallbacks, InteractionState } from "./interaction";

export { createStarField, createFog } from "./effects";
export { disposeObject } from "./dispose";
