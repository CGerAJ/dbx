<script setup lang="ts">
import { computed } from "vue";
import { Table2, KeyRound, Link2 } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import type { DiagramTable, DiagramRelationship } from "@/lib/diagram/erDiagram";
import type { InferredRelationship } from "@/types/diagram";
const props = defineProps<{
  data: {
    table: DiagramTable;
    relationships?: (DiagramRelationship | InferredRelationship)[];
  };
  selected?: boolean;
}>();
const emit = defineEmits<{
  (e: "dblclick", event: MouseEvent): void;
}>();
const MAX_VISIBLE_COLUMNS = 9;
const CARD_WIDTH = 270;
const CARD_HEADER_HEIGHT = 44;
const COLUMN_ROW_HEIGHT = 24;
const CARD_BOTTOM_PADDING = 12;
function visibleColumns(table: DiagramTable) {
  return table.columns.slice(0, MAX_VISIBLE_COLUMNS);
}
function hiddenColumnCount(table: DiagramTable): number {
  return Math.max(0, table.columns.length - MAX_VISIBLE_COLUMNS);
}
function isForeignKeyColumn(table: DiagramTable, columnName: string): boolean {
  return table.foreignKeys.some((fk) => fk.column === columnName);
}
function isRelationshipColumn(table: DiagramTable, columnName: string): boolean {
  if (!props.data.relationships) return false;
  return props.data.relationships.some((relationship) => (relationship.sourceTable === table.name && relationship.sourceColumn === columnName) || (relationship.targetTable === table.name && relationship.targetColumn === columnName));
}
const tableHeight = computed(() => {
  const visibleCount = Math.min(props.data.table.columns.length, MAX_VISIBLE_COLUMNS);
  const overflowHeight = props.data.table.columns.length > MAX_VISIBLE_COLUMNS ? 24 : 0;
  return CARD_HEADER_HEIGHT + visibleCount * COLUMN_ROW_HEIGHT + overflowHeight + CARD_BOTTOM_PADDING;
});
</script>

<template>
  <div class="overflow-hidden rounded-md border bg-background shadow-sm" :class="selected ? 'border-primary ring-1 ring-primary/30' : 'border-border'" :style="{ width: `${CARD_WIDTH}px` }" @dblclick.stop="emit('dblclick', $event)">
    <div class="flex h-11 cursor-grab items-center gap-2 border-b bg-muted/40 px-3 active:cursor-grabbing">
      <Table2 class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ data.table.name }}</span>
      <Badge variant="outline" class="h-5 px-1.5 text-[10px]">{{ data.table.columns.length }}</Badge>
    </div>
    <div>
      <div v-for="column in visibleColumns(data.table)" :key="column.name" class="flex h-6 items-center gap-1.5 border-b border-border/40 px-3 text-xs last:border-b-0">
        <KeyRound v-if="column.is_primary_key" class="h-3 w-3 shrink-0 text-amber-500" />
        <Link2 v-else-if="isForeignKeyColumn(data.table, column.name)" class="h-3 w-3 shrink-0 text-primary" />
        <Link2 v-else-if="isRelationshipColumn(data.table, column.name)" class="h-3 w-3 shrink-0 text-muted-foreground" />
        <span v-else class="h-3 w-3 shrink-0" />
        <span class="min-w-0 flex-1 truncate font-mono">{{ column.name }}</span>
        <span class="max-w-24 truncate text-[10px] text-muted-foreground">{{ column.data_type }}</span>
      </div>
      <div v-if="hiddenColumnCount(data.table) > 0" class="h-6 px-3 text-xs leading-6 text-muted-foreground">+{{ hiddenColumnCount(data.table) }} more columns</div>
    </div>
  </div>
</template>
