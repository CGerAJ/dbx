import ELK from "elkjs/lib/elk.bundled.js";
import type { LayoutOptions, DiagramNode, DiagramEdge } from "@/types/diagram";

const elk = new ELK();

export interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
}

export interface ElkGraph {
  id: string;
  children: ElkNode[];
  edges: ElkEdge[];
}

export async function computeLayout(nodes: DiagramNode[], edges: DiagramEdge[], options: LayoutOptions = {}): Promise<{ nodes: DiagramNode[]; edges: DiagramEdge[] }> {
  const elkGraph = buildElkGraph(nodes, edges);
  const elkOptions = buildElkOptions(options);

  const result = await elk.layout({
    ...elkGraph,
    layoutOptions: elkOptions,
  });

  return extractLayoutResult(result, nodes, edges);
}

function buildElkGraph(nodes: DiagramNode[], edges: DiagramEdge[]): ElkGraph {
  const elkNodes: ElkNode[] = nodes.map((node) => ({
    id: node.id,
    width: 270,
    height: Math.max(80, node.data.table.columns.length * 24 + 56),
  }));

  const elkEdges: ElkEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  return {
    id: "diagram",
    children: elkNodes,
    edges: elkEdges,
  };
}

function buildElkOptions(options: LayoutOptions): Record<string, string> {
  const directionMap: Record<string, string> = {
    LR: "RIGHT",
    TB: "DOWN",
    RL: "LEFT",
    BT: "UP",
  };

  return {
    "elk.algorithm": "layered",
    "elk.direction": directionMap[options.direction || "LR"],
    "elk.layered.edgeRouting": "ORTHOGONAL",
    "elk.layered.nodePlacement": "BRANDES_KOEPF",
    "elk.layered.crossingMinimization": "LAYER_SWEEP",
    "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
    "elk.layered.separateConnectedComponents": "true",
    "elk.spacing.nodeNode": "60",
    "elk.spacing.layerLayer": "80",
    "elk.padding": "40",
  };
}

function extractLayoutResult(result: ElkGraph, originalNodes: DiagramNode[], originalEdges: DiagramEdge[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nodePositionMap = new Map<string, { x: number; y: number }>();

  for (const child of result.children || []) {
    if (child.x !== undefined && child.y !== undefined) {
      nodePositionMap.set(child.id, { x: child.x, y: child.y });
    }
  }

  const newNodes = originalNodes.map((node) => {
    const position = nodePositionMap.get(node.id);
    return {
      ...node,
      position: position || node.position,
    };
  });

  return {
    nodes: newNodes,
    edges: originalEdges,
  };
}
