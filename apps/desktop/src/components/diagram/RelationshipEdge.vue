<script setup lang="ts">
import { computed, inject, type Ref, type ComputedRef } from "vue";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@vue-flow/core";
import type { DiagramRelationship } from "@/lib/diagram/erDiagram";
import type { InferredRelationship } from "@/types/diagram";
import { DIAGRAM_HOVERED_EDGE_KEY, DIAGRAM_EDGE_OBSTACLES_KEY, EDGE_ROUTE_OFFSET, EDGE_STROKE_IDLE, EDGE_STROKE_HOVER } from "@/lib/diagram/diagram-constants";
import type { RelationshipEdgeData } from "@/lib/diagram/vue-flow-adapter";
import { alignWaypointsToEndpoints, midpointAlongPolyline, pointsToSvgPath, routeOrthogonalAroundObstacles, type ObstacleRect, type Point } from "@/lib/diagram/edge-obstacle-router";

const HOVER_BLUE = "#2563eb";

const props = defineProps<EdgeProps<RelationshipEdgeData>>();

const hoveredEdgeId = inject<Ref<string | null> | null>(DIAGRAM_HOVERED_EDGE_KEY, null);
const obstacles = inject<ComputedRef<ObstacleRect[]> | Ref<ObstacleRect[]> | null>(DIAGRAM_EDGE_OBSTACLES_KEY, null);
const isHovered = computed(() => hoveredEdgeId?.value === props.id);

function isDiagramRelationship(rel: DiagramRelationship | InferredRelationship): rel is DiagramRelationship {
  return "kind" in rel;
}

function snapRoutedToHandles(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const snapped = points.map((p) => ({ ...p }));
  snapped[0] = { x: props.sourceX, y: props.sourceY };
  snapped[snapped.length - 1] = { x: props.targetX, y: props.targetY };
  return snapped;
}

function buildRoutedPoints(): Point[] | null {
  const stored = props.data?.waypoints;
  const obstacleList = obstacles?.value ?? [];
  if (stored?.length) {
    const aligned = alignWaypointsToEndpoints(stored, props.sourceX, props.sourceY, props.targetX, props.targetY, { obstacles: obstacleList, endpointIds: [props.source, props.target] });
    if (aligned?.length) return snapRoutedToHandles(aligned);
  }

  const routed = routeOrthogonalAroundObstacles({
    source: { x: props.sourceX, y: props.sourceY },
    target: { x: props.targetX, y: props.targetY },
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    obstacles: obstacleList,
    endpointIds: [props.source, props.target],
    offset: EDGE_ROUTE_OFFSET,
  });
  return routed?.length ? snapRoutedToHandles(routed) : null;
}

const pathResult = computed(() => {
  const routed = buildRoutedPoints();
  if (routed?.length) {
    const mid = midpointAlongPolyline(routed);
    return {
      path: pointsToSvgPath(routed),
      labelX: mid.x,
      labelY: mid.y,
    };
  }

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 0,
    offset: EDGE_ROUTE_OFFSET,
  });
  return { path, labelX, labelY };
});

const path = computed(() => pathResult.value.path);
const labelX = computed(() => pathResult.value.labelX);
const labelY = computed(() => pathResult.value.labelY);

const idleStroke = computed(() => {
  const rel = props.data?.relationship;
  if (!rel) {
    return "color-mix(in srgb, var(--muted-foreground) 45%, transparent)";
  }
  if (isDiagramRelationship(rel)) {
    if (rel.kind === "foreign-key") {
      return "color-mix(in srgb, var(--primary) 55%, transparent)";
    }
    if (rel.kind === "custom") {
      return "color-mix(in srgb, var(--primary) 70%, transparent)";
    }
  }
  return "color-mix(in srgb, var(--muted-foreground) 45%, transparent)";
});

const strokeColor = computed(() => (isHovered.value ? HOVER_BLUE : idleStroke.value));
const strokeWidth = computed(() => (isHovered.value ? EDGE_STROKE_HOVER : EDGE_STROKE_IDLE));

const strokeDasharray = computed(() => {
  const rel = props.data?.relationship;
  if (rel && isDiagramRelationship(rel) && (rel.kind === "foreign-key" || rel.kind === "custom")) {
    return "none";
  }
  return "5,5";
});

const markerId = computed(() => `relationship-arrow-${props.id}`);

const cardinalityLabel = computed(() => {
  const rel = props.data?.relationship;
  if (!rel) return "N:1";
  if (isDiagramRelationship(rel) && rel.sourceCardinality && rel.targetCardinality) {
    return `${rel.sourceCardinality}:${rel.targetCardinality}`;
  }
  return "N:1";
});
</script>

<template>
  <defs>
    <marker :id="markerId" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M 0 0 L 8 4 L 0 8 z" :fill="strokeColor" />
    </marker>
  </defs>
  <BaseEdge
    :id="id"
    :path="path"
    :interaction-width="28"
    :style="{
      stroke: strokeColor,
      strokeWidth: strokeWidth,
      strokeDasharray: strokeDasharray === 'none' ? undefined : strokeDasharray,
    }"
    :marker-end="`url(#${markerId})`"
  />
  <EdgeLabelRenderer>
    <div
      class="nopan nodrag pointer-events-none absolute z-10 rounded border bg-background/95 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none shadow-sm"
      :class="isHovered ? 'border-blue-500 text-blue-600' : 'border-border/80 text-foreground'"
      :style="{
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      }"
    >
      {{ cardinalityLabel }}
    </div>
  </EdgeLabelRenderer>
</template>

<style>
.diagram-flow .vue-flow__edge.relationship-edge,
.diagram-flow .vue-flow__edge.relationship-edge.inactive {
  pointer-events: stroke !important;
  cursor: pointer;
}

.diagram-flow .vue-flow__edge.relationship-edge .vue-flow__edge-interaction {
  stroke: #000 !important;
  stroke-opacity: 0 !important;
  pointer-events: stroke !important;
}

.diagram-flow .vue-flow__edge.relationship-edge:hover .vue-flow__edge-path,
.diagram-flow .vue-flow__edge.relationship-edge.updating .vue-flow__edge-path {
  stroke: #2563eb !important;
  stroke-width: 3.5px !important;
}

.diagram-flow .vue-flow__node-layer {
  pointer-events: none !important;
}

.diagram-flow .vue-flow__node-layer .layer-drag-handle {
  pointer-events: auto !important;
}
</style>
