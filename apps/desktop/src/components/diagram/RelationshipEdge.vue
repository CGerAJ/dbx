<script setup lang="ts">
import { computed } from "vue";
import type { DiagramRelationship } from "@/lib/diagram/erDiagram";
import type { InferredRelationship } from "@/types/diagram";

const props = defineProps<{
  data: {
    relationship: DiagramRelationship | InferredRelationship;
  };
}>();

const edgeClass = computed(() => {
  const rel = props.data.relationship;
  if ("kind" in rel) {
    if (rel.kind === "foreign-key") return "stroke-primary/55";
    if (rel.kind === "custom") return "stroke-primary/70";
  }
  return "stroke-muted-foreground/40";
});

const strokeDasharray = computed(() => {
  const rel = props.data.relationship;
  if ("kind" in rel) {
    if (rel.kind === "foreign-key" || rel.kind === "custom") return "none";
  }
  return "5,5";
});
</script>

<template>
  <svg :style="{ overflow: 'visible' }">
    <defs>
      <marker id="relationship-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" :class="edgeClass.replace('/55', '/70').replace('/40', '/50')" />
      </marker>
    </defs>
    <path :d="path" fill="none" :class="edgeClass" stroke-width="1.6" :stroke-dasharray="strokeDasharray" marker-end="url(#relationship-arrow)" />
  </svg>
</template>
