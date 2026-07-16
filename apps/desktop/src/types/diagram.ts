import type { DiagramTable, DiagramRelationship } from "@/lib/diagram/erDiagram";

export interface InferredRelationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  confidence: "high" | "medium";
  strategy: "naming_convention" | "type_signature" | "regex";
}

export interface MatchResult {
  relationships: InferredRelationship[];
  conflicts: InferredRelationship[];
  pending: InferredRelationship[];
  stats: { total: number; high: number; medium: number };
}

export interface LayoutOptions {
  direction?: "LR" | "TB" | "RL" | "BT";
}

export interface HistorySnapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface DiagramNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { table: DiagramTable };
  selected?: boolean;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: { relationship: DiagramRelationship | InferredRelationship };
}

export type RelationshipKind = "foreign-key" | "custom" | "inferred";

export interface MatchRule {
  id: string;
  name: string;
  pattern: string;
  enabled: boolean;
  priority: number;
}

export interface MatchStorageKeys {
  confirms: string;
  ignores: string;
  rules: string;
  enabled: string;
}
