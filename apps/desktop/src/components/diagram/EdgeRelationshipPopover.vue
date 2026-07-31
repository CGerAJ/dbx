<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiagramTable, DiagramRelationship, CustomDiagramRelationship } from "@/lib/diagram/erDiagram";
import type { InferredRelationship } from "@/types/diagram";

type Rel = DiagramRelationship | InferredRelationship;

const props = defineProps<{
  visible: boolean;
  relationship: Rel | null;
  tables: DiagramTable[];
  editing: boolean;
  position: { x: number; y: number };
}>();

const emit = defineEmits<{
  (e: "popover-enter"): void;
  (e: "popover-leave"): void;
  (e: "start-edit"): void;
  (e: "cancel-edit"): void;
  (e: "close"): void;
  (e: "save", payload: Omit<CustomDiagramRelationship, "id"> & { id?: string }): void;
  (e: "delete", id: string): void;
  (e: "confirm", payload: { id: string; sourceCardinality: "1" | "N"; targetCardinality: "1" | "N" }): void;
  (e: "ignore", id: string): void;
}>();

const { t } = useI18n();

const confirmingDelete = ref(false);

const draft = reactive({
  sourceTable: "",
  sourceColumn: "",
  targetTable: "",
  targetColumn: "",
  cardinality: "many-to-one" as "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many",
});

const kind = computed(() => {
  const rel = props.relationship;
  if (!rel) return "unknown";
  if ("kind" in rel) return rel.kind;
  return "inferred";
});

const cardinalityLabel = computed(() => {
  const rel = props.relationship;
  if (!rel) return "N:1";
  if ("sourceCardinality" in rel && "targetCardinality" in rel && rel.sourceCardinality && rel.targetCardinality) {
    return `${rel.sourceCardinality}:${rel.targetCardinality}`;
  }
  return "N:1";
});

const kindLabel = computed(() => {
  if (kind.value === "foreign-key") return t("diagram.relationshipKindFk");
  if (kind.value === "custom") return t("diagram.relationshipKindCustom");
  if (kind.value === "inferred") return t("diagram.relationshipKindInferred");
  return "";
});

const tableMap = computed(() => new Map(props.tables.map((table) => [table.name, table])));

const sourceColumns = computed(() => tableMap.value.get(draft.sourceTable)?.columns ?? []);
const targetColumns = computed(() => tableMap.value.get(draft.targetTable)?.columns ?? []);

function cardinalityFromRel(rel: Rel): typeof draft.cardinality {
  if (!("sourceCardinality" in rel) || !("targetCardinality" in rel)) return "many-to-one";
  const s = rel.sourceCardinality;
  const tg = rel.targetCardinality;
  if (s === "1" && tg === "1") return "one-to-one";
  if (s === "1" && tg === "N") return "one-to-many";
  if (s === "N" && tg === "N") return "many-to-many";
  return "many-to-one";
}

function syncDraftFromRelationship() {
  const rel = props.relationship;
  if (!rel) return;
  draft.sourceTable = rel.sourceTable;
  draft.sourceColumn = rel.sourceColumn;
  draft.targetTable = rel.targetTable;
  draft.targetColumn = rel.targetColumn;
  draft.cardinality = cardinalityFromRel(rel);
}

watch(
  () => [props.relationship, props.editing, props.visible] as const,
  () => {
    confirmingDelete.value = false;
    if (props.visible && props.relationship) syncDraftFromRelationship();
  },
  { immediate: true },
);

watch(
  () => draft.sourceTable,
  () => {
    if (!sourceColumns.value.some((c) => c.name === draft.sourceColumn)) {
      draft.sourceColumn = sourceColumns.value[0]?.name ?? "";
    }
  },
);

watch(
  () => draft.targetTable,
  () => {
    if (!targetColumns.value.some((c) => c.name === draft.targetColumn)) {
      draft.targetColumn = targetColumns.value[0]?.name ?? "";
    }
  },
);

function cardinalityPair(): { sourceCardinality: "1" | "N"; targetCardinality: "1" | "N" } {
  if (draft.cardinality === "one-to-one") return { sourceCardinality: "1", targetCardinality: "1" };
  if (draft.cardinality === "one-to-many") return { sourceCardinality: "1", targetCardinality: "N" };
  if (draft.cardinality === "many-to-many") return { sourceCardinality: "N", targetCardinality: "N" };
  return { sourceCardinality: "N", targetCardinality: "1" };
}

function handleSave() {
  const rel = props.relationship;
  if (!rel) return;
  const card = cardinalityPair();
  emit("save", {
    id: "kind" in rel && rel.kind === "custom" ? rel.id : undefined,
    name: "name" in rel ? rel.name : `${draft.sourceTable}_${draft.sourceColumn}_${draft.targetTable}_${draft.targetColumn}`,
    sourceTable: draft.sourceTable,
    sourceColumn: draft.sourceColumn,
    targetTable: draft.targetTable,
    targetColumn: draft.targetColumn,
    ...card,
  });
}

function handleConfirm() {
  const rel = props.relationship;
  if (!rel) return;
  emit("confirm", { id: rel.id, ...cardinalityPair() });
}

function handleIgnore() {
  const rel = props.relationship;
  if (!rel) return;
  emit("ignore", rel.id);
}

function requestDelete() {
  confirmingDelete.value = true;
  emit("popover-enter");
}

function cancelDelete() {
  confirmingDelete.value = false;
}

function confirmDelete() {
  const rel = props.relationship;
  if (!rel) return;
  confirmingDelete.value = false;
  emit("delete", rel.id);
}

function handleClose() {
  confirmingDelete.value = false;
  emit("close");
}

function handlePopoverLeave() {
  if (confirmingDelete.value) return;
  emit("popover-leave");
}
</script>

<template>
  <div
    v-if="visible && relationship"
    class="nopan nodrag absolute z-50 w-72 rounded-md border border-border bg-background/95 p-3 text-xs shadow-lg"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
      transform: 'translate(-50%, calc(-100% - 12px))',
    }"
    @mouseenter="emit('popover-enter')"
    @mouseleave="handlePopoverLeave"
    @click.stop
    @mousedown.stop
  >
    <div class="mb-2 flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="truncate font-medium text-foreground">
          {{ relationship.sourceTable }}.{{ relationship.sourceColumn }}
          →
          {{ relationship.targetTable }}.{{ relationship.targetColumn }}
        </div>
        <div class="mt-0.5 text-[10px] text-muted-foreground">
          {{ kindLabel }} · {{ cardinalityLabel }}
          <span v-if="'confidence' in relationship"> · {{ relationship.confidence }}</span>
        </div>
      </div>
      <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" @click="handleClose">×</button>
    </div>

    <p v-if="kind === 'foreign-key'" class="mb-2 text-[10px] text-muted-foreground">
      {{ t("diagram.relationshipReadOnlyFk") }}
    </p>

    <div v-if="confirmingDelete && kind === 'custom'" class="space-y-2">
      <p class="text-[11px] text-muted-foreground">{{ t("diagram.confirmDeleteRelationship") }}</p>
      <div class="flex gap-1.5">
        <Button size="sm" variant="destructive" class="h-7 flex-1 text-xs" @click="confirmDelete">
          {{ t("diagram.confirmDeleteRelationshipAction") }}
        </Button>
        <Button size="sm" variant="outline" class="h-7 flex-1 text-xs" @click="cancelDelete">
          {{ t("common.cancel") }}
        </Button>
      </div>
    </div>

    <div v-else-if="editing && kind === 'custom'" class="space-y-2">
      <Select v-model="draft.sourceTable">
        <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="table in tables" :key="`s-${table.name}`" :value="table.name">{{ table.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="draft.sourceColumn">
        <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="col in sourceColumns" :key="`sc-${col.name}`" :value="col.name">{{ col.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="draft.cardinality">
        <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="one-to-one">1:1</SelectItem>
          <SelectItem value="one-to-many">1:N</SelectItem>
          <SelectItem value="many-to-one">N:1</SelectItem>
          <SelectItem value="many-to-many">N:N</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="draft.targetTable">
        <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="table in tables" :key="`t-${table.name}`" :value="table.name">{{ table.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="draft.targetColumn">
        <SelectTrigger class="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="col in targetColumns" :key="`tc-${col.name}`" :value="col.name">{{ col.name }}</SelectItem>
        </SelectContent>
      </Select>
      <div class="flex gap-1.5 pt-1">
        <Button size="sm" class="h-7 flex-1 text-xs" @click="handleSave">{{ t("diagram.saveRelationship") }}</Button>
        <Button size="sm" variant="outline" class="h-7 flex-1 text-xs" @click="emit('cancel-edit')">{{ t("common.cancel") }}</Button>
      </div>
    </div>

    <div v-else class="flex flex-wrap gap-1.5">
      <Button v-if="kind === 'custom'" size="sm" class="h-7 text-xs" @click="emit('start-edit')">
        {{ t("diagram.editRelationship") }}
      </Button>
      <Button v-if="kind === 'custom'" size="sm" variant="destructive" class="h-7 text-xs" @click="requestDelete">
        {{ t("diagram.deleteRelationship") }}
      </Button>
      <Button v-if="kind === 'inferred'" size="sm" class="h-7 text-xs" @click="handleConfirm">
        {{ t("diagram.confirmRelationship") }}
      </Button>
      <Button v-if="kind === 'inferred'" size="sm" variant="outline" class="h-7 text-xs" @click="handleIgnore">
        {{ t("diagram.ignoreRelationship") }}
      </Button>
    </div>
  </div>
</template>
