/**
 * Web Worker: Force-directed 3D layout using d3-force-3d.
 *
 * Messages:
 *   Main → Worker:  { type: 'init', nodes, links, params }   (nodes may carry preset x/y/z)
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
  dimensions: 2 | 3;
  clusterStrength: number;
  charge: number;
  distanceMax: number;
  theta: number;
  linkDistance: number;
  alphaDecay: number;
  velocityDecay: number;
  settledThreshold: number;
  postEvery: number;
  initialRadius: number;
  preset?: "ignore" | "seed" | "pin";
  initialAlpha?: number;
}

interface InitNode {
  id: string;
  x?: number;
  y?: number;
  z?: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

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

    const dims: 2 | 3 = params.dimensions === 2 ? 2 : 3;

    const preset = params.preset ?? "ignore";
    let pinned = 0;
    simNodes = msg.nodes.map(
      (nd: InitNode, i: number): SimNode => {
        // Use preserved position if available, then a preset one, otherwise random placement
        const prev = initPos[nd.id];
        if (prev) {
          return {
            id: nd.id,
            index: i,
            x: prev.x,
            y: prev.y,
            z: dims === 2 ? 0 : prev.z,
          };
        }
        if (preset !== "ignore" && finite(nd.x) && finite(nd.y)) {
          const z = dims === 2 || !finite(nd.z) ? 0 : nd.z;
          const sn: SimNode & { fx?: number; fy?: number; fz?: number } = { id: nd.id, index: i, x: nd.x, y: nd.y, z };
          if (preset === "pin") {
            sn.fx = nd.x;
            sn.fy = nd.y;
            sn.fz = z;
            pinned++;
          }
          return sn;
        }
        const theta = Math.random() * Math.PI * 2;
        const r = params.initialRadius * (0.5 + Math.random() * 0.5);
        if (dims === 2) {
          // Flat disc — z locked to the plane
          return {
            id: nd.id,
            index: i,
            x: r * Math.cos(theta),
            y: r * Math.sin(theta),
            z: 0,
          };
        }
        const phi = Math.acos(2 * Math.random() - 1);
        return {
          id: nd.id,
          index: i,
          x: r * Math.sin(phi) * Math.cos(theta),
          y: r * Math.sin(phi) * Math.sin(theta),
          z: r * Math.cos(phi),
        };
      }
    );

    // Everything pinned: nothing to simulate, report the positions once.
    if (preset === "pin" && pinned === n) {
      sim = null;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i * 3] = simNodes[i].x;
        positions[i * 3 + 1] = simNodes[i].y;
        positions[i * 3 + 2] = dims === 2 ? 0 : simNodes[i].z;
      }
      self.postMessage({ type: "positions", positions: positions.buffer, alpha: 0 }, [positions.buffer] as any);
      settled = true;
      self.postMessage({ type: "settled" });
      return;
    }

    const simLinks = msg.links.map((l: { source: string; target: string }) => ({
      source: l.source,
      target: l.target,
    }));

    sim = forceSimulation(simNodes, dims)
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
      .alpha(params.initialAlpha ?? 1)
      .alphaDecay(params.alphaDecay)
      .velocityDecay(params.velocityDecay);
    // A seeded layout is already arranged: center it gently instead of re-centering hard
    if (preset !== "ignore") (sim.force("center") as any)?.strength?.(0.05);

    // Optional cluster force: pull nodes of the same group toward their
    // group centroid so categories form visible clusters (Obsidian look).
    // msg.groups: per-node group index (-1 = ungrouped), aligned with nodes.
    const groups: number[] | undefined = msg.groups;
    if (groups && groups.length === simNodes.length && params.clusterStrength > 0) {
      const k = params.clusterStrength;
      sim.force("cluster", (alpha: number) => {
        const cx: Record<number, number> = {};
        const cy: Record<number, number> = {};
        const cz: Record<number, number> = {};
        const cn: Record<number, number> = {};
        for (let i = 0; i < simNodes.length; i++) {
          const g = groups[i];
          if (g < 0) continue;
          cx[g] = (cx[g] ?? 0) + simNodes[i].x;
          cy[g] = (cy[g] ?? 0) + simNodes[i].y;
          cz[g] = (cz[g] ?? 0) + (simNodes[i].z || 0);
          cn[g] = (cn[g] ?? 0) + 1;
        }
        const pull = k * alpha;
        for (let i = 0; i < simNodes.length; i++) {
          const g = groups[i];
          if (g < 0 || !cn[g]) continue;
          const n = simNodes[i] as SimNode & { vx: number; vy: number; vz: number };
          n.vx = (n.vx || 0) + (cx[g] / cn[g] - n.x) * pull;
          n.vy = (n.vy || 0) + (cy[g] / cn[g] - n.y) * pull;
          if (dims === 3) n.vz = (n.vz || 0) + (cz[g] / cn[g] - n.z) * pull;
        }
      });
    }

    sim.on("tick", () => {
      tickCount++;

      const alpha = sim!.alpha();
      if (tickCount % params.postEvery !== 0 && alpha > params.settledThreshold)
        return;

      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i * 3] = simNodes[i].x || 0;
        positions[i * 3 + 1] = simNodes[i].y || 0;
        positions[i * 3 + 2] = dims === 2 ? 0 : simNodes[i].z || 0;
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
