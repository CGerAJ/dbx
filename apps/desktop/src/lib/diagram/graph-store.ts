import { defineStore } from "pinia";
import { ref } from "vue";
import type { DiagramNode, DiagramEdge, HistorySnapshot, LayoutOptions } from "@/types/diagram";
import { LayoutManager } from "./layout-manager";

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const useGraphStore = defineStore("diagram-graph", () => {
  const nodes = ref<DiagramNode[]>([]);
  const edges = ref<DiagramEdge[]>([]);
  const historyStack = ref<HistorySnapshot[]>([]);
  const redoStack = ref<HistorySnapshot[]>([]);
  const maxHistorySize = 50;
  const layoutManager = new LayoutManager();

  function pushHistory() {
    historyStack.value.push({
      nodes: deepClone(nodes.value),
      edges: deepClone(edges.value),
    });
    if (historyStack.value.length > maxHistorySize) {
      historyStack.value.shift();
    }
    redoStack.value = [];
  }

  function undo() {
    if (historyStack.value.length === 0) return;

    redoStack.value.push({
      nodes: deepClone(nodes.value),
      edges: deepClone(edges.value),
    });

    const prev = historyStack.value.pop()!;
    nodes.value = prev.nodes;
    edges.value = prev.edges;
  }

  function redo() {
    if (redoStack.value.length === 0) return;

    historyStack.value.push({
      nodes: deepClone(nodes.value),
      edges: deepClone(edges.value),
    });

    const next = redoStack.value.pop()!;
    nodes.value = next.nodes;
    edges.value = next.edges;
  }

  function canUndo() {
    return historyStack.value.length > 0;
  }

  function canRedo() {
    return redoStack.value.length > 0;
  }

  function setNodes(newNodes: DiagramNode[]) {
    nodes.value = newNodes;
  }

  function setEdges(newEdges: DiagramEdge[]) {
    edges.value = newEdges;
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }) {
    const node = nodes.value.find((n) => n.id === nodeId);
    if (node) {
      pushHistory();
      node.position = position;
    }
  }

  async function applyLayout(direction?: LayoutOptions["direction"]) {
    pushHistory();
    const result = await layoutManager.applyElkLayout(nodes.value, edges.value, direction);
    nodes.value = result.nodes;
    edges.value = result.edges;
  }

  function applyGridLayout() {
    pushHistory();
    nodes.value = layoutManager.applyGridLayout(nodes.value);
  }

  function clearHistory() {
    historyStack.value = [];
    redoStack.value = [];
  }

  return {
    nodes,
    edges,
    undo,
    redo,
    canUndo,
    canRedo,
    pushHistory,
    setNodes,
    setEdges,
    updateNodePosition,
    applyLayout,
    applyGridLayout,
    clearHistory,
  };
});
