import type { DiagramTable, DiagramRelationship } from "./erDiagram";
import type { InferredRelationship, DiagramNode, DiagramEdge } from "@/types/diagram";
import type { Node, Edge } from "@vue-flow/core";

export function toVueFlowNodes(tables: DiagramTable[], positions?: Record<string, { x: number; y: number }>): Node<{ table: DiagramTable }>[] {
  return tables.map((table) => ({
    id: table.name,
    type: "table",
    position: positions?.[table.name] || { x: 0, y: 0 },
    data: { table },
  }));
}

export function toDiagramNodes(vueFlowNodes: Node<{ table: DiagramTable }>[]): DiagramNode[] {
  return vueFlowNodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { table: node.data.table },
    selected: node.selected,
  }));
}

export function toVueFlowEdges(relationships: (DiagramRelationship | InferredRelationship)[]): Edge<{ relationship: DiagramRelationship | InferredRelationship }>[] {
  return relationships.map((rel) => ({
    id: rel.id,
    source: rel.sourceTable,
    target: rel.targetTable,
    data: { relationship: rel },
  }));
}

export function toDiagramEdges(vueFlowEdges: Edge<{ relationship: DiagramRelationship | InferredRelationship }>[]): DiagramEdge[] {
  return vueFlowEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    data: { relationship: edge.data.relationship },
  }));
}
