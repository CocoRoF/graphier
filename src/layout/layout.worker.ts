/**
 * Web Worker: Force-directed 3D layout using d3-force-3d.
 *
 * Messages:
 *   Main → Worker:  { type: 'init', nodes, links, params }
 *                   { type: 'stop' }
 *   Worker → Main:  { type: 'positions', positions: ArrayBuffer, alpha }
 *                   { type: 'settled' }
 */
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
} from "d3-force-3d";

interface SimNode {
  id: string;
  index: number;
  x: number;
  y: number;
  z: number;
}

interface LayoutParams {
  charge: number;
  distanceMax: number;
  theta: number;
  linkDistance: number;
  alphaDecay: number;
  velocityDecay: number;
  settledThreshold: number;
  postEvery: number;
  initialRadius: number;
}

let sim: ReturnType<typeof forceSimulation> | null = null;
let simNodes: SimNode[] = [];
let tickCount = 0;
let settled = false;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === "init") {
    if (sim) sim.stop();
    settled = false;
    tickCount = 0;

    const n: number = msg.nodes.length;
    const params: LayoutParams = msg.params;

    // initialPositions: Map<nodeId, {x,y,z}> for position preservation
    const initPos: Record<string, { x: number; y: number; z: number }> =
      msg.initialPositions ?? {};

    simNodes = msg.nodes.map(
      (nd: { id: string }, i: number): SimNode => {
        // Use preserved position if available, otherwise random sphere
        const prev = initPos[nd.id];
        if (prev) {
          return { id: nd.id, index: i, x: prev.x, y: prev.y, z: prev.z };
        }
        // New node: place near a connected neighbor if possible
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = params.initialRadius * (0.5 + Math.random() * 0.5);
        return {
          id: nd.id,
          index: i,
          x: r * Math.sin(phi) * Math.cos(theta),
          y: r * Math.sin(phi) * Math.sin(theta),
          z: r * Math.cos(phi),
        };
      }
    );

    const simLinks = msg.links.map((l: { source: string; target: string }) => ({
      source: l.source,
      target: l.target,
    }));

    sim = forceSimulation(simNodes, 3)
      .force(
        "charge",
        forceManyBody()
          .strength(params.charge)
          .distanceMax(params.distanceMax)
          .theta(params.theta)
      )
      .force(
        "link",
        forceLink(simLinks)
          .id((d: any) => d.id)
          .distance(params.linkDistance)
          .strength(0.2)
      )
      .force("center", forceCenter())
      .alphaDecay(params.alphaDecay)
      .velocityDecay(params.velocityDecay);

    sim.on("tick", () => {
      tickCount++;

      const alpha = sim!.alpha();
      if (tickCount % params.postEvery !== 0 && alpha > params.settledThreshold)
        return;

      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i * 3] = simNodes[i].x || 0;
        positions[i * 3 + 1] = simNodes[i].y || 0;
        positions[i * 3 + 2] = simNodes[i].z || 0;
      }

      self.postMessage(
        { type: "positions", positions: positions.buffer, alpha },
        [positions.buffer] as any
      );

      if (!settled && alpha < params.settledThreshold) {
        settled = true;
        self.postMessage({ type: "settled" });
      }
    });
  }

  if (msg.type === "stop") {
    if (sim) {
      sim.stop();
      sim = null;
    }
  }
};
