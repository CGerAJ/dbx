<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";
import { useConnectionStore } from "@/stores/connectionStore";
import { useGraphStore } from "@/lib/diagram/graph-store";
import DatabaseIcon from "@/components/icons/DatabaseIcon.vue";
import ConnectionGroupBadge from "@/components/connection/ConnectionGroupBadge.vue";
import * as api from "@/lib/backend/api";
import { DIAGRAM_SQL_TYPES, isSchemaAware as isSchemaAwareDatabase } from "@/lib/database/databaseCapabilities";
import { databaseOptionsForConnection } from "@/composables/useDatabaseOptions";
import { buildDiagramJoinSql, buildDiagramRelationships, filterDiagramTables, normalizeCustomDiagramRelationship, type CustomDiagramRelationship, type DiagramPosition, type DiagramRelationship, type DiagramTable } from "@/lib/diagram/erDiagram";
import { buildEngineeringDiagram } from "@/lib/diagram/engineeringDiagram";
import { buildEngineeringDiagramSvg, buildTableDiagramSvg, diagramSvgFileName } from "@/lib/export/diagramSvgExport";
import { inferRelationships, filterByStorage, mergeRelationships } from "@/lib/diagram/match-engine";
import { loadMatchConfirms, saveMatchConfirms, loadMatchIgnores, saveMatchIgnores, isAutoMatchEnabled } from "@/lib/diagram/match-storage";
import { toVueFlowNodes, toVueFlowEdges } from "@/lib/diagram/vue-flow-adapter";
import type { InferredRelationship, MatchResult } from "@/types/diagram";
import { Copy, Download, KeyRound, Link2, Loader2, Maximize2, Network, Plus, RefreshCw, Search, Table2, Trash2, X, ZoomIn, ZoomOut, ScanSearch, LayoutGrid } from "@lucide/vue";
import { useToast } from "@/composables/useToast";
import { isTauriRuntime } from "@/lib/backend/tauriRuntime";
import { copyToClipboard } from "@/lib/common/clipboard";
import TableNode from "./TableNode.vue";
import RelationshipEdge from "./RelationshipEdge.vue";
import MatchPanel from "./MatchPanel.vue";
import DiagramToolbar from "./DiagramToolbar.vue";

const { t } = useI18n();
const { toast } = useToast();
const open = defineModel<boolean>("open", { default: false });
const store = useConnectionStore();
const graphStore = useGraphStore();
const { nodes, edges, onNodesChange, onEdgesChange, addNodes, setNodes, setEdges, viewport, fitView } = useVueFlow();

const props = defineProps<{
  prefillConnectionId?: string;
  prefillDatabase?: string;
  prefillSchema?: string;
  focusTableName?: string;
}>();

const emit = defineEmits<{
  "open-target": [
    value: {
      connectionId: string;
      database: string;
      schema?: string;
      tableName: string;
      tableType?: string;
    },
  ];
}>();

const CARD_WIDTH = 270;
const COLUMN_ROW_HEIGHT = 24;
const CARD_HEADER_HEIGHT = 44;
const CARD_BOTTOM_PADDING = 12;
const MAX_VISIBLE_COLUMNS = 9;
const METADATA_BATCH_SIZE = 4;

const connectionId = ref("");
const database = ref("");
const schema = ref("");
const databases = ref<string[]>([]);
const schemas = ref<string[]>([]);
const tables = ref<DiagramTable[]>([]);
const customRelationships = ref<CustomDiagramRelationship[]>([]);
const tableSearch = ref("");
const loadingDatabases = ref(false);
const loadingSchemas = ref(false);
const loadingDiagram = ref(false);
const loadedTableCount = ref(0);
const totalTableCount = ref(0);
const failedTableCount = ref(0);
const positions = ref<Record<string, DiagramPosition>>({});
const showAllTables = ref(false);
const diagramMode = ref<"table" | "engineering">("table");
const showRelationshipPanel = ref(false);
const showMatchPanel = ref(false);
const matchResult = ref<MatchResult>({ relationships: [], conflicts: [], pending: [], stats: { total: 0, high: 0, medium: 0 } });
const matchConfirms = ref<string[]>([]);
const matchIgnores = ref<string[]>([]);
const relationshipDraft = ref({
  name: "",
  sourceTable: "",
  sourceColumn: "",
  targetTable: "",
  targetColumn: "",
  cardinality: "one-to-many" as "one-to-one" | "one-to-many" | "many-to-one",
});

const nodeTypes = { table: TableNode };
const edgeTypes = { relationship: RelationshipEdge };

const sqlConnections = computed(() => store.connections.filter((connection) => DIAGRAM_SQL_TYPES.has(connection.db_type)));

const selectedConnection = computed(() => (connectionId.value ? store.getConfig(connectionId.value) : undefined));

const isSchemaAware = computed(() => isSchemaAwareDatabase(selectedConnection.value?.db_type));

const tableMap = computed(() => new Map(tables.value.map((table) => [table.name, table])));

const allRelationships = computed(() => buildDiagramRelationships(tables.value, customRelationships.value));

const allRelationshipsWithInferred = computed(() => {
  if (!isAutoMatchEnabled()) return allRelationships.value;
  return mergeRelationships(allRelationships.value, matchResult.value.relationships);
});

const relatedTableNames = computed(() => {
  const focus = props.focusTableName;
  const names = new Set<string>();
  if (!focus) return names;
  names.add(focus);
  for (const relationship of allRelationships.value) {
    if (relationship.sourceTable === focus) names.add(relationship.targetTable);
    if (relationship.targetTable === focus) names.add(relationship.sourceTable);
  }
  return names;
});

const visibleTables = computed(() => {
  const filtered = filterDiagramTables(tables.value, tableSearch.value);
  if (props.focusTableName && !showAllTables.value && !tableSearch.value.trim()) {
    return filtered.filter((table) => relatedTableNames.value.has(table.name));
  }
  return filtered;
});

const visibleRelationships = computed(() => {
  const baseRelationships = buildDiagramRelationships(visibleTables.value, customRelationships.value);
  if (!isAutoMatchEnabled()) return baseRelationships;

  const visibleTableNames = new Set(visibleTables.value.map((t) => t.name));
  const inferredVisible = matchResult.value.relationships.filter((r) => visibleTableNames.has(r.sourceTable) && visibleTableNames.has(r.targetTable));

  return mergeRelationships(baseRelationships, inferredVisible);
});

const diagramReady = computed(() => !!connectionId.value && !!database.value && (!isSchemaAware.value || !!schema.value));

const loadingText = computed(() => (totalTableCount.value > 0 ? t("diagram.loadingProgress", { loaded: loadedTableCount.value, total: totalTableCount.value }) : t("diagram.loading")));

const sourceColumns = computed(() => tableMap.value.get(relationshipDraft.value.sourceTable)?.columns ?? []);

const targetColumns = computed(() => tableMap.value.get(relationshipDraft.value.targetTable)?.columns ?? []);

const generatedJoinSql = computed(() => buildDiagramJoinSql(visibleRelationships.value));

const customRelationshipCount = computed(() => customRelationships.value.length);

const matchRelationshipCount = computed(() => matchResult.value.relationships.length);

function connectionIconType(id: string) {
  const config = store.getConfig(id);
  return config?.driver_profile || config?.db_type || "mysql";
}

function tableHeight(table: DiagramTable): number {
  const visibleCount = Math.min(table.columns.length, MAX_VISIBLE_COLUMNS);
  const overflowHeight = table.columns.length > MAX_VISIBLE_COLUMNS ? 24 : 0;
  return CARD_HEADER_HEIGHT + visibleCount * COLUMN_ROW_HEIGHT + overflowHeight + CARD_BOTTOM_PADDING;
}

const canvasSize = computed(() => {
  let width = 960;
  let height = 540;
  for (const table of visibleTables.value) {
    const position = positions.value[table.name];
    if (!position) continue;
    width = Math.max(width, position.x + CARD_WIDTH + 80);
    height = Math.max(height, position.y + tableHeight(table) + 80);
  }
  return { width, height };
});

const engineeringDiagram = computed(() => buildEngineeringDiagram(visibleTables.value, visibleRelationships.value, positions.value));

const activeCanvasSize = computed(() => (diagramMode.value === "engineering" ? engineeringDiagram.value.canvas : canvasSize.value));

function resetLayout() {
  const count = visibleTables.value.length;
  const columnsPerRow = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(count, 1)))));

  const newPositions: Record<string, DiagramPosition> = {};
  const cardWidth = CARD_WIDTH;
  const rowHeight = 240;
  const gapX = 64;
  const gapY = 44;
  const margin = 40;

  for (let i = 0; i < visibleTables.value.length; i++) {
    const table = visibleTables.value[i];
    const col = i % columnsPerRow;
    const row = Math.floor(i / columnsPerRow);
    newPositions[table.name] = {
      x: margin + col * (cardWidth + gapX),
      y: margin + row * (rowHeight + gapY),
    };
  }

  positions.value = newPositions;
  syncVueFlowNodes();
}

async function applyAutoLayout() {
  await graphStore.applyLayout();
}

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
  return visibleRelationships.value.some((relationship) => (relationship.sourceTable === table.name && relationship.sourceColumn === columnName) || (relationship.targetTable === table.name && relationship.targetColumn === columnName));
}

function relationshipTitle(relationship: DiagramRelationship): string {
  return `${relationship.sourceTable}.${relationship.sourceColumn} (${relationship.sourceCardinality}:${relationship.targetCardinality}) -> ${relationship.targetTable}.${relationship.targetColumn}`;
}

function openTableData(tableName: string) {
  if (!connectionId.value || !database.value || !tableName) return;
  emit("open-target", {
    connectionId: connectionId.value,
    database: database.value,
    schema: isSchemaAware.value ? schema.value || undefined : undefined,
    tableName,
    tableType: "TABLE",
  });
}

function syncVueFlowNodes() {
  const vueNodes = toVueFlowNodes(visibleTables.value, positions.value);
  const vueEdges = toVueFlowEdges(visibleRelationships.value);
  setNodes(vueNodes);
  setEdges(vueEdges);
}

function relationshipStorageKey(): string {
  if (!connectionId.value || !database.value) return "";
  return ["dbx", "diagram", "relationships", "v1", connectionId.value, database.value, schema.value || ""].join(":");
}

function isStoredRelationship(value: unknown): value is CustomDiagramRelationship {
  const relationship = value as Partial<CustomDiagramRelationship>;
  return (
    typeof relationship?.id === "string" &&
    typeof relationship.name === "string" &&
    typeof relationship.sourceTable === "string" &&
    typeof relationship.sourceColumn === "string" &&
    typeof relationship.targetTable === "string" &&
    typeof relationship.targetColumn === "string" &&
    (relationship.sourceCardinality === "1" || relationship.sourceCardinality === "N") &&
    (relationship.targetCardinality === "1" || relationship.targetCardinality === "N")
  );
}

function loadCustomRelationships() {
  const key = relationshipStorageKey();
  if (!key || typeof localStorage === "undefined") {
    customRelationships.value = [];
    return;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    customRelationships.value = Array.isArray(parsed) ? parsed.filter(isStoredRelationship) : [];
  } catch {
    customRelationships.value = [];
  }
}

function saveCustomRelationships() {
  const key = relationshipStorageKey();
  if (!key || typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(customRelationships.value));
}

function loadMatchData() {
  if (!connectionId.value || !database.value) return;
  const querySchema = schema.value || database.value;
  matchConfirms.value = loadMatchConfirms(connectionId.value, database.value, querySchema);
  matchIgnores.value = loadMatchIgnores(connectionId.value, database.value, querySchema);

  if (isAutoMatchEnabled() && tables.value.length > 0) {
    const inferred = inferRelationships(tables.value);
    matchResult.value = filterByStorage(inferred, matchConfirms.value, matchIgnores.value);
  }
}

function saveMatchData() {
  if (!connectionId.value || !database.value) return;
  const querySchema = schema.value || database.value;
  saveMatchConfirms(matchConfirms.value, connectionId.value, database.value, querySchema);
  saveMatchIgnores(matchIgnores.value, connectionId.value, database.value, querySchema);
}

function confirmMatch(id: string) {
  if (!matchConfirms.value.includes(id)) {
    matchConfirms.value = [...matchConfirms.value, id];
  }
  matchIgnores.value = matchIgnores.value.filter((i) => i !== id);
  saveMatchData();
  refreshMatchResult();
}

function ignoreMatch(id: string) {
  if (!matchIgnores.value.includes(id)) {
    matchIgnores.value = [...matchIgnores.value, id];
  }
  matchConfirms.value = matchConfirms.value.filter((i) => i !== id);
  saveMatchData();
  refreshMatchResult();
}

function confirmAllMatches() {
  const pendingIds = matchResult.value.pending.map((r) => r.id);
  matchConfirms.value = [...matchConfirms.value, ...pendingIds];
  saveMatchData();
  refreshMatchResult();
}

function ignoreAllMatches() {
  const pendingIds = matchResult.value.pending.map((r) => r.id);
  matchIgnores.value = [...matchIgnores.value, ...pendingIds];
  saveMatchData();
  refreshMatchResult();
}

function clearAllMatches() {
  matchConfirms.value = [];
  matchIgnores.value = [];
  saveMatchData();
  refreshMatchResult();
}

function refreshMatchResult() {
  if (isAutoMatchEnabled() && tables.value.length > 0) {
    const inferred = inferRelationships(tables.value);
    matchResult.value = filterByStorage(inferred, matchConfirms.value, matchIgnores.value);
  }
}

function defaultRelationshipName(relationship: Omit<CustomDiagramRelationship, "id" | "name">): string {
  return `${relationship.sourceTable}_${relationship.sourceColumn}_${relationship.targetTable}_${relationship.targetColumn}`;
}

function relationshipCardinality(): Pick<CustomDiagramRelationship, "sourceCardinality" | "targetCardinality"> {
  if (relationshipDraft.value.cardinality === "one-to-one") return { sourceCardinality: "1", targetCardinality: "1" };
  if (relationshipDraft.value.cardinality === "many-to-one") return { sourceCardinality: "N", targetCardinality: "1" };
  return { sourceCardinality: "1", targetCardinality: "N" };
}

function updateRelationshipDraftDefaults() {
  const availableTables = tables.value.filter((table) => table.columns.length > 0);
  if (availableTables.length === 0) return;

  if (!tableMap.value.has(relationshipDraft.value.sourceTable)) {
    relationshipDraft.value.sourceTable = availableTables[0].name;
  }
  if (!tableMap.value.has(relationshipDraft.value.targetTable)) {
    relationshipDraft.value.targetTable = availableTables[1]?.name ?? availableTables[0].name;
  }
  if (!sourceColumns.value.some((column) => column.name === relationshipDraft.value.sourceColumn)) {
    relationshipDraft.value.sourceColumn = sourceColumns.value[0]?.name ?? "";
  }
  if (!targetColumns.value.some((column) => column.name === relationshipDraft.value.targetColumn)) {
    relationshipDraft.value.targetColumn = targetColumns.value[0]?.name ?? "";
  }
}

function addCustomRelationship() {
  updateRelationshipDraftDefaults();
  const { sourceTable, sourceColumn, targetTable, targetColumn } = relationshipDraft.value;
  if (!sourceTable || !sourceColumn || !targetTable || !targetColumn) {
    toast(t("diagram.relationshipIncomplete"), 3000);
    return;
  }
  if (sourceTable === targetTable && sourceColumn === targetColumn) {
    toast(t("diagram.relationshipSelfInvalid"), 3000);
    return;
  }

  const cardinality = relationshipCardinality();
  const relationship = normalizeCustomDiagramRelationship({
    name: relationshipDraft.value.name.trim() || defaultRelationshipName({ sourceTable, sourceColumn, targetTable, targetColumn, ...cardinality }),
    sourceTable,
    sourceColumn,
    targetTable,
    targetColumn,
    ...cardinality,
  });

  if (customRelationships.value.some((item) => item.id === relationship.id)) {
    toast(t("diagram.relationshipExists"), 3000);
    return;
  }

  customRelationships.value = [...customRelationships.value, relationship];
  relationshipDraft.value.name = "";
  saveCustomRelationships();
  toast(t("diagram.relationshipAdded"), 2000);
}

function removeCustomRelationship(id: string) {
  customRelationships.value = customRelationships.value.filter((relationship) => relationship.id !== id);
  saveCustomRelationships();
}

async function copyJoinSql() {
  if (!generatedJoinSql.value.trim()) {
    toast(t("diagram.noJoinSql"), 3000);
    return;
  }
  try {
    await copyToClipboard(generatedJoinSql.value);
    toast(t("grid.copied"));
  } catch (e: any) {
    toast(t("grid.copyFailed", { message: e?.message || String(e) }), 5000);
  }
}

async function loadDatabases(id: string) {
  if (!id) return;
  loadingDatabases.value = true;
  databases.value = [];
  try {
    await store.ensureConnected(id);
    const dbs = await api.listDatabases(id);
    databases.value = databaseOptionsForConnection(
      dbs.map((db) => db.name),
      store.getConfig(id),
    );
  } catch (e: any) {
    toast(e?.message || String(e), 5000);
  } finally {
    loadingDatabases.value = false;
  }
}

async function loadSchemas() {
  schemas.value = [];
  schema.value = "";
  if (!connectionId.value || !database.value) return;
  if (!isSchemaAware.value) {
    schema.value = database.value;
    return;
  }

  loadingSchemas.value = true;
  try {
    const names = await api.listSchemas(connectionId.value, database.value);
    schemas.value = names;
    schema.value = props.prefillSchema && names.includes(props.prefillSchema) ? props.prefillSchema : names.includes("public") ? "public" : (names[0] ?? "");
  } catch (e: any) {
    toast(e?.message || String(e), 5000);
  } finally {
    loadingSchemas.value = false;
  }
}

async function setConnection(id: string) {
  connectionId.value = id;
  database.value = "";
  schema.value = "";
  tables.value = [];
  customRelationships.value = [];
  positions.value = {};
  matchConfirms.value = [];
  matchIgnores.value = [];
  matchResult.value = { relationships: [], conflicts: [], pending: [], stats: { total: 0, high: 0, medium: 0 } };
  await loadDatabases(id);
  if (databases.value.length === 1) {
    await setDatabase(databases.value[0]);
  }
}

async function setDatabase(value: string) {
  database.value = value;
  tables.value = [];
  customRelationships.value = [];
  positions.value = {};
  matchConfirms.value = [];
  matchIgnores.value = [];
  matchResult.value = { relationships: [], conflicts: [], pending: [], stats: { total: 0, high: 0, medium: 0 } };
  await loadSchemas();
  if (diagramReady.value) await loadDiagram();
}

async function setSchema(value: string) {
  schema.value = value;
  tables.value = [];
  customRelationships.value = [];
  positions.value = {};
  matchConfirms.value = [];
  matchIgnores.value = [];
  matchResult.value = { relationships: [], conflicts: [], pending: [], stats: { total: 0, high: 0, medium: 0 } };
  if (diagramReady.value) await loadDiagram();
}

async function loadTableDiagramData(tableName: string, querySchema: string): Promise<DiagramTable> {
  try {
    const [columns, foreignKeys] = await Promise.all([api.getColumns(connectionId.value, database.value, querySchema, tableName), api.listForeignKeys(connectionId.value, database.value, querySchema, tableName).catch(() => [])]);
    return { name: tableName, columns, foreignKeys };
  } catch (e) {
    failedTableCount.value += 1;
    console.warn(`[diagram] failed to load table metadata: ${tableName}`, e);
    return { name: tableName, columns: [], foreignKeys: [] };
  }
}

async function loadDiagram() {
  if (!diagramReady.value) return;

  loadingDiagram.value = true;
  tables.value = [];
  positions.value = {};
  loadedTableCount.value = 0;
  totalTableCount.value = 0;
  failedTableCount.value = 0;
  try {
    await store.ensureConnected(connectionId.value);
    const querySchema = schema.value || database.value;
    const tableInfos = await api.listTables(connectionId.value, database.value, querySchema);
    const baseTables = tableInfos.filter((table) => table.table_type !== "VIEW" && table.table_type !== "MATERIALIZED_VIEW").sort((a, b) => a.name.localeCompare(b.name));
    totalTableCount.value = baseTables.length;

    const loadedTables: DiagramTable[] = [];
    for (let index = 0; index < baseTables.length; index += METADATA_BATCH_SIZE) {
      const batch = baseTables.slice(index, index + METADATA_BATCH_SIZE);
      const batchTables = await Promise.all(batch.map((table) => loadTableDiagramData(table.name, querySchema)));
      loadedTables.push(...batchTables);
      loadedTableCount.value = loadedTables.length;
    }

    tables.value = loadedTables;
    loadCustomRelationships();
    loadMatchData();
    updateRelationshipDraftDefaults();
    showAllTables.value = false;
    await nextTick();
    resetLayout();
    if (failedTableCount.value > 0) {
      toast(t("diagram.partialError", { count: failedTableCount.value }), 5000);
    }
  } catch (e: any) {
    toast(e?.message || String(e), 5000);
  } finally {
    loadingDiagram.value = false;
  }
}

async function initialize() {
  connectionId.value = "";
  database.value = "";
  schema.value = "";
  databases.value = [];
  schemas.value = [];
  tables.value = [];
  customRelationships.value = [];
  tableSearch.value = "";
  showAllTables.value = false;
  showRelationshipPanel.value = false;
  showMatchPanel.value = false;
  diagramMode.value = "table";
  positions.value = {};
  loadedTableCount.value = 0;
  totalTableCount.value = 0;
  failedTableCount.value = 0;
  matchConfirms.value = [];
  matchIgnores.value = [];
  matchResult.value = { relationships: [], conflicts: [], pending: [], stats: { total: 0, high: 0, medium: 0 } };

  if (props.prefillConnectionId) {
    connectionId.value = props.prefillConnectionId;
    await loadDatabases(props.prefillConnectionId);
    const initialDatabase = props.prefillDatabase && databases.value.includes(props.prefillDatabase) ? props.prefillDatabase : props.prefillDatabase || databases.value[0] || "";
    if (initialDatabase) await setDatabase(initialDatabase);
    return;
  }

  if (sqlConnections.value.length === 1) {
    await setConnection(sqlConnections.value[0].id);
  }
}

function zoomIn() {
  viewport.value = { ...viewport.value, zoom: viewport.value.zoom + 0.1 };
}

function zoomOut() {
  viewport.value = { ...viewport.value, zoom: Math.max(0.2, viewport.value.zoom - 0.1) };
}

function resetZoomAndLayout() {
  viewport.value = { x: 0, y: 0, zoom: 1 };
  resetLayout();
}

function currentDiagramSvg(): string {
  if (diagramMode.value === "engineering") {
    return buildEngineeringDiagramSvg(engineeringDiagram.value);
  }

  return buildTableDiagramSvg({
    tables: visibleTables.value,
    relationships: visibleRelationships.value,
    positions: positions.value,
    relationshipPaths: {},
    canvas: canvasSize.value,
    cardWidth: CARD_WIDTH,
    cardHeaderHeight: CARD_HEADER_HEIGHT,
    columnRowHeight: COLUMN_ROW_HEIGHT,
    maxVisibleColumns: MAX_VISIBLE_COLUMNS,
    cardBottomPadding: CARD_BOTTOM_PADDING,
    moreColumnsLabel: (count) => t("diagram.moreColumns", { count }),
  });
}

async function exportSvg() {
  try {
    const scopeName = isSchemaAware.value && schema.value ? `${database.value}-${schema.value}` : database.value;
    const defaultPath = diagramSvgFileName(selectedConnection.value?.name ?? "", scopeName, diagramMode.value);
    const svgContent = currentDiagramSvg();

    if (isTauriRuntime()) {
      const [{ save }, { writeTextFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
      const path = await save({
        defaultPath,
        filters: [{ name: "SVG", extensions: ["svg"] }],
      });
      if (!path) return;
      await writeTextFile(path, svgContent);
    } else {
      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast(t("diagram.exportedSvg"));
  } catch (e: any) {
    toast(t("diagram.exportSvgFailed", { message: e?.message || String(e) }), 5000);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    graphStore.undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "y") {
    e.preventDefault();
    graphStore.redo();
  }
}

watch(
  open,
  (value) => {
    if (value) void initialize();
  },
  { immediate: true },
);

watch(
  () => visibleTables.value.map((table) => table.name).join("\n"),
  () => {
    resetLayout();
  },
);

watch(
  () => relationshipDraft.value.sourceTable,
  () => {
    if (!sourceColumns.value.some((column) => column.name === relationshipDraft.value.sourceColumn)) {
      relationshipDraft.value.sourceColumn = sourceColumns.value[0]?.name ?? "";
    }
  },
);

watch(
  () => relationshipDraft.value.targetTable,
  () => {
    if (!targetColumns.value.some((column) => column.name === relationshipDraft.value.targetColumn)) {
      relationshipDraft.value.targetColumn = targetColumns.value[0]?.name ?? "";
    }
  },
);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="w-[94vw] max-w-[94vw] sm:max-w-[94vw] md:max-w-[94vw] lg:max-w-[94vw] xl:max-w-[94vw] h-[86vh] max-h-[86vh] gap-0 p-0 overflow-hidden flex flex-col">
      <DialogHeader class="px-4 py-3 border-b">
        <DialogTitle class="flex items-center gap-2">
          <Network class="w-4 h-4" />
          {{ t("diagram.title") }}
        </DialogTitle>
      </DialogHeader>

      <DiagramToolbar
        :connection-id="connectionId"
        :database="database"
        :schema="schema"
        :databases="databases"
        :schemas="schemas"
        :sql-connections="sqlConnections"
        :selected-connection="selectedConnection"
        :is-schema-aware="isSchemaAware"
        :loading-databases="loadingDatabases"
        :loading-schemas="loadingSchemas"
        :loading-diagram="loadingDiagram"
        :diagram-ready="diagramReady"
        :tables-count="visibleTables.length"
        :relationships-count="visibleRelationships.length"
        :custom-relationship-count="customRelationshipCount"
        :match-relationship-count="matchRelationshipCount"
        :diagram-mode="diagramMode"
        :table-search="tableSearch"
        :show-relationship-panel="showRelationshipPanel"
        :show-match-panel="showMatchPanel"
        :show-all-tables="showAllTables"
        :focus-table-name="focusTableName"
        :generated-join-sql="generatedJoinSql"
        @set-connection="setConnection"
        @set-database="setDatabase"
        @set-schema="setSchema"
        @update:table-search="(value) => (tableSearch = value)"
        @set-diagram-mode="(value) => (diagramMode = value)"
        @toggle-relationship-panel="showRelationshipPanel = !showRelationshipPanel"
        @toggle-match-panel="showMatchPanel = !showMatchPanel"
        @copy-join-sql="copyJoinSql"
        @toggle-show-all-tables="showAllTables = !showAllTables"
        @export-svg="exportSvg"
        @refresh="loadDiagram"
        @zoom-out="zoomOut"
        @zoom-in="zoomIn"
        @reset-layout="resetZoomAndLayout"
        @auto-layout="applyAutoLayout"
      />

      <div v-if="showMatchPanel && tables.length > 0 && isAutoMatchEnabled()" class="shrink-0 border-b bg-background/95 px-3 py-2">
        <MatchPanel
          :relationships="matchResult.relationships"
          :conflicts="matchResult.conflicts"
          :pending="matchResult.pending"
          :confirmed-ids="matchConfirms"
          :ignored-ids="matchIgnores"
          @confirm="confirmMatch"
          @ignore="ignoreMatch"
          @confirm-all="confirmAllMatches"
          @ignore-all="ignoreAllMatches"
          @clear-all="clearAllMatches"
        />
      </div>

      <div class="flex min-h-0 flex-1 flex-col bg-muted/20">
        <div v-if="showRelationshipPanel && tables.length > 0" class="shrink-0 border-b bg-background/95 px-3 py-2">
          <div class="flex flex-wrap items-end gap-2">
            <div class="w-44">
              <div class="mb-1 text-[11px] font-medium text-muted-foreground">{{ t("diagram.relationshipName") }}</div>
              <Input v-model="relationshipDraft.name" class="h-8 text-xs" :placeholder="t('diagram.relationshipNamePlaceholder')" />
            </div>

            <div class="w-44">
              <div class="mb-1 text-[11px] font-medium text-muted-foreground">{{ t("diagram.sourceTable") }}</div>
              <Select v-model="relationshipDraft.sourceTable">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue :placeholder="t('diagram.sourceTable')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="table in tables" :key="`source-${table.name}`" :value="table.name" :disabled="table.columns.length === 0">{{ table.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="w-44">
              <div class="mb-1 text-[11px] font-medium text-muted-foreground">{{ t("diagram.sourceColumn") }}</div>
              <Select v-model="relationshipDraft.sourceColumn">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue :placeholder="t('diagram.sourceColumn')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="column in sourceColumns" :key="`source-column-${column.name}`" :value="column.name">{{ column.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="w-32">
              <div class="mb-1 text-[11px] font-medium text-muted-foreground">{{ t("diagram.cardinality") }}</div>
              <Select v-model="relationshipDraft.cardinality">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-to-many">{{ t("diagram.cardinalityOneToMany") }}</SelectItem>
                  <SelectItem value="many-to-one">{{ t("diagram.cardinalityManyToOne") }}</SelectItem>
                  <SelectItem value="one-to-one">{{ t("diagram.cardinalityOneToOne") }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="w-44">
              <div class="mb-1 text-[11px] font-medium text-muted-foreground">{{ t("diagram.targetTable") }}</div>
              <Select v-model="relationshipDraft.targetTable">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue :placeholder="t('diagram.targetTable')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="table in tables" :key="`target-${table.name}`" :value="table.name" :disabled="table.columns.length === 0">{{ table.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="w-44">
              <div class="mb-1 text-[11px] font-medium text-muted-foreground">{{ t("diagram.targetColumn") }}</div>
              <Select v-model="relationshipDraft.targetColumn">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue :placeholder="t('diagram.targetColumn')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="column in targetColumns" :key="`target-column-${column.name}`" :value="column.name">{{ column.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="default" size="sm" class="h-8 px-2 text-xs" @click="addCustomRelationship">
              <Plus class="mr-1 h-3.5 w-3.5" />
              {{ t("diagram.addRelationship") }}
            </Button>
            <Button variant="ghost" size="icon" class="h-8 w-8" :title="t('common.close')" @click="showRelationshipPanel = false">
              <X class="h-4 w-4" />
            </Button>
          </div>

          <div v-if="customRelationships.length > 0" class="mt-2 flex flex-wrap gap-1.5">
            <Badge v-for="relationship in customRelationships" :key="relationship.id" variant="secondary" class="gap-1 pr-1">
              <span class="max-w-80 truncate">{{ relationship.sourceTable }}.{{ relationship.sourceColumn }} {{ relationship.sourceCardinality }}:{{ relationship.targetCardinality }} {{ relationship.targetTable }}.{{ relationship.targetColumn }}</span>
              <button type="button" class="rounded-sm p-0.5 hover:bg-background/80" :title="t('diagram.removeRelationship')" @click="removeCustomRelationship(relationship.id)">
                <Trash2 class="h-3 w-3" />
              </button>
            </Badge>
          </div>
        </div>

        <div class="min-h-0 flex-1">
          <div v-if="loadingDiagram" class="h-full flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            {{ loadingText }}
          </div>
          <div v-else-if="!diagramReady" class="h-full flex items-center justify-center text-sm text-muted-foreground">
            {{ t("diagram.selectTarget") }}
          </div>
          <div v-else-if="tables.length === 0" class="h-full flex items-center justify-center text-sm text-muted-foreground">
            {{ t("diagram.empty") }}
          </div>
          <div v-else-if="visibleTables.length === 0" class="h-full flex items-center justify-center text-sm text-muted-foreground">
            {{ t("diagram.noMatches") }}
          </div>
          <VueFlow v-else-if="diagramMode === 'table'" :nodes="nodes" :edges="edges" :node-types="nodeTypes" :edge-types="edgeTypes" :fit-view-options="{ padding: 40 }" class="w-full h-full" @nodes-change="onNodesChange" @edges-change="onEdgesChange">
            <Background />
            <Controls />
            <MiniMap />
          </VueFlow>
          <div v-else class="min-h-0 flex-1 overflow-auto">
            <div class="relative" :style="{ width: `${activeCanvasSize.width}px`, height: `${activeCanvasSize.height}px` }">
              <svg class="absolute inset-0 h-full w-full overflow-visible pointer-events-none">
                <g class="stroke-foreground/70">
                  <line
                    v-for="attribute in engineeringDiagram.attributes"
                    :key="attribute.id"
                    :x1="engineeringDiagram.entities.find((e) => e.name === attribute.tableName) ? engineeringDiagram.entities.find((e) => e.name === attribute.tableName)!.x + engineeringDiagram.entities.find((e) => e.name === attribute.tableName)!.width / 2 : 0"
                    :y1="engineeringDiagram.entities.find((e) => e.name === attribute.tableName) ? engineeringDiagram.entities.find((e) => e.name === attribute.tableName)!.y + engineeringDiagram.entities.find((e) => e.name === attribute.tableName)!.height / 2 : 0"
                    :x2="attribute.x + attribute.width / 2"
                    :y2="attribute.y + attribute.height / 2"
                    stroke-width="1.2"
                  />
                  <template v-for="relationship in engineeringDiagram.relationships" :key="relationship.id">
                    <line
                      :x1="engineeringDiagram.entities.find((e) => e.name === relationship.sourceTable) ? engineeringDiagram.entities.find((e) => e.name === relationship.sourceTable)!.x + engineeringDiagram.entities.find((e) => e.name === relationship.sourceTable)!.width / 2 : 0"
                      :y1="engineeringDiagram.entities.find((e) => e.name === relationship.sourceTable) ? engineeringDiagram.entities.find((e) => e.name === relationship.sourceTable)!.y + engineeringDiagram.entities.find((e) => e.name === relationship.sourceTable)!.height / 2 : 0"
                      :x2="relationship.x + relationship.width / 2"
                      :y2="relationship.y + relationship.height / 2"
                      stroke-width="1.4"
                    />
                    <line
                      :x1="relationship.x + relationship.width / 2"
                      :y1="relationship.y + relationship.height / 2"
                      :x2="engineeringDiagram.entities.find((e) => e.name === relationship.targetTable) ? engineeringDiagram.entities.find((e) => e.name === relationship.targetTable)!.x + engineeringDiagram.entities.find((e) => e.name === relationship.targetTable)!.width / 2 : 0"
                      :y2="engineeringDiagram.entities.find((e) => e.name === relationship.targetTable) ? engineeringDiagram.entities.find((e) => e.name === relationship.targetTable)!.y + engineeringDiagram.entities.find((e) => e.name === relationship.targetTable)!.height / 2 : 0"
                      stroke-width="1.4"
                    />
                  </template>
                </g>
              </svg>
              <div
                v-for="attribute in engineeringDiagram.attributes"
                :key="attribute.id"
                class="absolute flex items-center justify-center rounded-full border border-green-600/55 bg-green-100/80 px-3 text-center text-xs text-green-950 shadow-sm dark:bg-green-950/35 dark:text-green-100"
                :class="attribute.primaryKey ? 'font-semibold underline underline-offset-2' : ''"
                :title="`${attribute.tableName}.${attribute.columnName}: ${attribute.dataType}`"
                :style="{ width: `${attribute.width}px`, height: `${attribute.height}px`, transform: `translate(${attribute.x}px, ${attribute.y}px)` }"
              >
                <span class="truncate">{{ attribute.label }}</span>
              </div>
              <div
                v-for="relationship in engineeringDiagram.relationships"
                :key="relationship.id"
                class="absolute flex items-center justify-center text-center text-xs font-medium text-red-950 dark:text-red-100"
                :style="{ width: `${relationship.width}px`, height: `${relationship.height}px`, transform: `translate(${relationship.x}px, ${relationship.y}px)` }"
                :title="`${relationship.sourceTable} -> ${relationship.targetTable}`"
              >
                <div class="absolute inset-0 border border-red-500/70 bg-red-100/80 dark:bg-red-950/35" style="clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)" />
                <span class="relative max-w-[70px] truncate">{{ relationship.label }}</span>
              </div>
              <div
                v-for="entity in engineeringDiagram.entities"
                :key="entity.id"
                class="absolute flex cursor-pointer items-center justify-center border border-blue-500/70 bg-blue-100/80 px-3 text-center text-sm font-semibold text-blue-950 shadow-sm dark:bg-blue-950/35 dark:text-blue-100"
                :class="entity.name === focusTableName ? 'ring-2 ring-primary/40' : ''"
                :style="{ width: `${entity.width}px`, height: `${entity.height}px`, transform: `translate(${entity.x}px, ${entity.y}px)` }"
                @dblclick.stop="openTableData(entity.name)"
              >
                <span class="truncate">{{ entity.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
