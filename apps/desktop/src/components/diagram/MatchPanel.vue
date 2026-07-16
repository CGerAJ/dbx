<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Trash2 } from "@lucide/vue";
import type { InferredRelationship } from "@/types/diagram";

const { t } = useI18n();

const props = defineProps<{
  relationships: InferredRelationship[];
  conflicts: InferredRelationship[];
  pending: InferredRelationship[];
  confirmedIds: string[];
  ignoredIds: string[];
}>();

const emit = defineEmits<{
  (e: "confirm", id: string): void;
  (e: "ignore", id: string): void;
  (e: "confirm-all"): void;
  (e: "ignore-all"): void;
  (e: "clear-all"): void;
}>();

const isConfirmed = (id: string) => props.confirmedIds.includes(id);
const isIgnored = (id: string) => props.ignoredIds.includes(id);

const statusBadge = (relationship: InferredRelationship) => {
  if (isConfirmed(relationship.id)) {
    return { variant: "default" as const, text: "Confirmed" };
  }
  if (isIgnored(relationship.id)) {
    return { variant: "outline" as const, text: "Ignored" };
  }
  if (props.conflicts.includes(relationship)) {
    return { variant: "secondary" as const, text: "Conflict" };
  }
  return { variant: "outline" as const, text: "Pending" };
};

const relationshipTitle = (relationship: InferredRelationship) => {
  return `${relationship.sourceTable}.${relationship.sourceColumn} -> ${relationship.targetTable}.${relationship.targetColumn}`;
};
</script>

<template>
  <div class="shrink-0 border-b bg-background/95 px-3 py-2">
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Badge variant="secondary" class="h-5 px-2 text-xs"> {{ relationships.length }} total </Badge>
        <Badge variant="default" class="h-5 px-2 text-xs"> {{ confirmedIds.length }} confirmed </Badge>
        <Badge variant="outline" class="h-5 px-2 text-xs"> {{ pending.length }} pending </Badge>
        <Badge v-if="conflicts.length > 0" variant="secondary" class="h-5 px-2 text-xs"> {{ conflicts.length }} conflicts </Badge>
      </div>
      <div class="flex items-center gap-1.5">
        <Button variant="outline" size="sm" class="h-7 px-2 text-xs" :disabled="pending.length === 0" @click="emit('confirm-all')">
          <Check class="mr-1 h-3 w-3" />
          Confirm All
        </Button>
        <Button variant="outline" size="sm" class="h-7 px-2 text-xs" :disabled="pending.length === 0" @click="emit('ignore-all')">
          <X class="mr-1 h-3 w-3" />
          Ignore All
        </Button>
        <Button variant="ghost" size="icon" class="h-7 w-7" :disabled="confirmedIds.length === 0 && ignoredIds.length === 0" @click="emit('clear-all')">
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div class="max-h-48 overflow-y-auto">
      <div v-if="relationships.length === 0" class="text-xs text-muted-foreground">No inferred relationships found</div>
      <div v-else class="flex flex-wrap gap-1.5">
        <Badge v-for="relationship in relationships" :key="relationship.id" :variant="statusBadge(relationship).variant" class="gap-1 pr-1">
          <span class="max-w-80 truncate">{{ relationshipTitle(relationship) }}</span>
          <button v-if="!isConfirmed(relationship.id) && !isIgnored(relationship.id)" type="button" class="rounded-sm p-0.5 hover:bg-background/80" title="Confirm" @click="emit('confirm', relationship.id)">
            <Check class="h-3 w-3" />
          </button>
          <button v-if="!isConfirmed(relationship.id) && !isIgnored(relationship.id)" type="button" class="rounded-sm p-0.5 hover:bg-background/80" title="Ignore" @click="emit('ignore', relationship.id)">
            <X class="h-3 w-3" />
          </button>
        </Badge>
      </div>
    </div>
  </div>
</template>
