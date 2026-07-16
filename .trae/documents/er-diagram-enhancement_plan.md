# DBX ER 图增强实现计划

## 一、项目调研结论

### 1.1 现有架构

| 维度 | 现状 |
|------|------|
| **技术栈** | Vue 3 + TypeScript + Vite + Pinia + shadcn-vue |
| **后端** | Rust + Tauri 2 |
| **包管理** | pnpm |
| **ER 图实现** | 自研 SVG 渲染，约 1150 行单体组件 `SchemaDiagramDialog.vue` |
| **存储模式** | `localStorage` + `dbx:diagram:relationships:v1:{connId}:{db}:{schema}` |
| **安全存储封装** | `lib/backend/safeStorage.ts` 提供 `safeLocalStorageGet/Set/Remove` |

### 1.2 现有文件结构

```
apps/desktop/src/
├── components/diagram/
│   └── SchemaDiagramDialog.vue     # 单体组件（1150+ 行）
├── lib/diagram/
│   ├── erDiagram.ts                # 核心数据模型
│   ├── engineeringDiagram.ts       # 工程 ER 图
│   ├── diagramZoom.ts              # 缩放控制
│   └── fieldLineage.ts             # 字段血缘
├── lib/backend/
│   └── safeStorage.ts              # localStorage 安全封装
├── stores/                         # Pinia stores
└── types/database.ts               # ColumnInfo, ForeignKeyInfo 等类型
```

### 1.3 核心类型定义

- `ColumnInfo`（[database.ts:411-425](file:///workspace/apps/desktop/src/types/database.ts#L411-L425)）：现有字段包括 `name`, `data_type`, `is_nullable`, `is_primary_key` 等
- `ForeignKeyInfo`（[database.ts:438-446](file:///workspace/apps/desktop/src/types/database.ts#L438-L446)）：`name`, `column`, `ref_table`, `ref_column`
- `DiagramRelationship`（[erDiagram.ts:9-19](file:///workspace/apps/desktop/src/lib/diagram/erDiagram.ts#L9-L19)）：`id`, `name`, `kind`, `sourceTable`, `sourceColumn`, `targetTable`, `targetColumn`, `sourceCardinality`, `targetCardinality`

---

## 二、实现方案

### 2.1 技术选型

| 能力层 | 选型 | 理由 |
|--------|------|------|
| 画布框架 | Vue Flow (`@vue-flow/core`, `@vue-flow/minimap`, `@vue-flow/controls`) | Vue 3 项目，ReactFlow 忠实移植 |
| 布局引擎 | ELK.js (`elkjs`) | 分层布局 + 正交边路由，打包确保离线可用 |
| 状态管理 | Pinia（现有） | DBX 已用 Pinia，撤销/重做内嵌到 store |
| 配置存储 | localStorage + safeStorage（现有） | 沿用 `dbx:diagram:...` key 前缀 |

### 2.2 模块拆分架构

```
UI 层 (Vue Components)
├── SchemaDiagramDialog.vue    # Dialog 容器 + 工具栏
├── TableNode.vue              # 表卡片（Vue Flow 自定义节点）
├── RelationshipEdge.vue       # 关系线（Vue Flow 自定义边）
├── MatchPanel.vue             # 匹配规则管理面板
└── DiagramToolbar.vue         # 工具栏提取

适配层
└── VueFlowAdapter             # 图数据 ↔ VueFlow 格式转换

核心引擎 (lib/diagram/)
├── GraphStore                 # Pinia + 撤销/重做历史栈
├── LayoutManager              # ELK.js 布局 + 正交边路由
├── MatchEngine                # ID 关联智能匹配
└── MatchStorage               # 匹配规则 localStorage 读写

后端 (Rust) — 仅微调
└── schema.rs                  # +get_all_columns, +ColumnInfo.is_unique
```

---

## 三、文件修改清单

### 3.1 新增文件

| 文件路径 | 说明 | 优先级 |
|----------|------|--------|
| `apps/desktop/src/components/diagram/TableNode.vue` | Vue Flow 自定义节点 - 表卡片 | P0 |
| `apps/desktop/src/components/diagram/RelationshipEdge.vue` | Vue Flow 自定义边 - 关系线 | P0 |
| `apps/desktop/src/components/diagram/MatchPanel.vue` | 匹配规则管理面板 | P0 |
| `apps/desktop/src/components/diagram/DiagramToolbar.vue` | 工具栏组件提取 | P0 |
| `apps/desktop/src/lib/diagram/vue-flow-adapter.ts` | Vue Flow 适配层 | P0 |
| `apps/desktop/src/lib/diagram/graph-store.ts` | Pinia store + 撤销/重做 | P0 |
| `apps/desktop/src/lib/diagram/layout-manager.ts` | 布局调度 | P0 |
| `apps/desktop/src/lib/diagram/elk-layout.ts` | ELK.js 布局配置 | P0 |
| `apps/desktop/src/lib/diagram/match-engine.ts` | 智能匹配引擎 | P0 |
| `apps/desktop/src/lib/diagram/match-strategies.ts` | 匹配策略（命名约定、类型签名） | P0 |
| `apps/desktop/src/lib/diagram/match-storage.ts` | localStorage 读写 | P0 |
| `apps/desktop/src/types/diagram.ts` | 新增类型定义 | P0 |

### 3.2 修改文件

| 文件路径 | 修改内容 | 优先级 |
|----------|----------|--------|
| `apps/desktop/src/components/diagram/SchemaDiagramDialog.vue` | 重构：拆分为容器 + 集成 Vue Flow | P0 |
| `apps/desktop/src/lib/diagram/erDiagram.ts` | 扩展：新增推断关系类型、去重逻辑 | P0 |
| `apps/desktop/src/types/database.ts` | 新增：`ColumnInfo.is_unique` 字段 | P0 |
| `apps/desktop/src/lib/backend/api.ts` | 新增：`get_all_columns` API 转发 | P0 |
| `apps/desktop/src/lib/backend/http.ts` | 新增：`get_all_columns` HTTP 实现 | P0 |
| `apps/desktop/src/lib/backend/tauri.ts` | 新增：`get_all_columns` Tauri 实现 | P0 |
| `src-tauri/src/commands/schema.rs` | 新增：`get_all_columns` 命令 | P0 |
| `crates/dbx-core/src/schema/mod.rs` | 新增：`get_all_columns_core` 实现 | P0 |
| `crates/dbx-core/src/db/types.rs` | 新增：`ColumnInfo.is_unique` 字段 | P0 |

---

## 四、实施步骤

### Phase 1: Vue Flow 迁移 + 智能匹配 + 撤销重做

#### Step 1.1: 安装依赖

```bash
pnpm add @vue-flow/core @vue-flow/minimap @vue-flow/controls elkjs
pnpm add -D @types/elkjs
```

#### Step 1.2: 新增类型定义 (`types/diagram.ts`)

```typescript
export interface InferredRelationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  confidence: 'high' | 'medium';
  strategy: 'naming_convention' | 'type_signature' | 'regex';
}

export interface MatchResult {
  relationships: InferredRelationship[];
  conflicts: InferredRelationship[];
  pending: InferredRelationship[];
  stats: { total: number; high: number; medium: number };
}

export interface LayoutOptions {
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
}

export interface DiagramNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { table: DiagramTable };
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: { relationship: DiagramRelationship | InferredRelationship };
}
```

#### Step 1.3: 实现匹配存储 (`match-storage.ts`)

使用 `safeLocalStorageGet/Set/Remove`，key 格式：
- `dbx:diagram:match-confirms:v1:{connId}:{db}:{schema}`
- `dbx:diagram:match-ignores:v1:{connId}:{db}:{schema}`
- `dbx:diagram:match-rules:v1:{connId}:{db}:{schema}`
- `dbx:diagram:match-enabled`

#### Step 1.4: 实现匹配策略 (`match-strategies.ts`)

- **P1 命名约定**：`{table}_id` / `{table}_uuid` → 目标表主键
- **P2 类型签名**：P1 + 源列与目标列类型兼容

#### Step 1.5: 实现匹配引擎 (`match-engine.ts`)

核心函数：
- `inferRelationships(tables: DiagramTable[])`: InferredRelationship[]
- `filterByStorage(inferred, confirms, ignores)`: MatchResult
- `buildRelationshipId(sourceTable, sourceColumn, targetTable, targetColumn)`: string

#### Step 1.6: 实现 Vue Flow 适配层 (`vue-flow-adapter.ts`)

- `toVueFlowNodes(tables)`: 将 DiagramTable 转换为 Vue Flow 节点
- `toVueFlowEdges(relationships)`: 将关系转换为 Vue Flow 边
- `fromVueFlowNodes(nodes)`: 将 Vue Flow 节点转换回 DiagramTable

#### Step 1.7: 实现布局管理器 (`layout-manager.ts`)

- 集成 ELK.js
- 支持方向切换（LR/TB/RL/BT）
- 网格布局 fallback

#### Step 1.8: 实现 GraphStore (`graph-store.ts`)

Pinia store 包含：
- `nodes`: DiagramNode[]
- `edges`: DiagramEdge[]
- `historyStack`: HistorySnapshot[]
- `redoStack`: HistorySnapshot[]
- `undo()` / `redo()` / `pushHistory()`

#### Step 1.9: 实现 Vue Flow 自定义组件

- `TableNode.vue`: 表卡片渲染
- `RelationshipEdge.vue`: 关系线渲染（虚线/实线区分）
- `MatchPanel.vue`: 匹配规则管理面板
- `DiagramToolbar.vue`: 工具栏组件

#### Step 1.10: 重构 SchemaDiagramDialog.vue

- 集成 Vue Flow
- 集成 MatchPanel
- 集成工具栏
- 集成撤销/重做快捷键

#### Step 1.11: 后端修改

- `crates/dbx-core/src/db/types.rs`: `ColumnInfo` 新增 `is_unique`
- `crates/dbx-core/src/schema/mod.rs`: 新增 `get_all_columns_core`
- `src-tauri/src/commands/schema.rs`: 新增 `get_all_columns` Tauri 命令
- `apps/desktop/src/lib/backend/tauri.ts`: 新增 Tauri 调用
- `apps/desktop/src/lib/backend/http.ts`: 新增 HTTP 调用
- `apps/desktop/src/lib/backend/api.ts`: 新增 API 转发

---

### Phase 2: 交互增强 + e2e 测试

- 框选（`SelectionMode.Partial`）
- 连线交互（悬停高亮）
- MiniMap（50+ 表时自动显示）
- 显示控制（列/注释/匹配关系开关）
- Playwright e2e 测试

---

### Phase 3: 高级功能 + 性能优化

- 虚拟化（`onlyRenderVisibleElements`）
- 路径过滤
- 正则规则（P3 用户自定义）
- 侧边栏拖入

---

## 五、存储方案

### 5.1 localStorage Key 设计

| 数据类型 | Key 格式 | 说明 |
|----------|----------|------|
| 自定义关系 | `dbx:diagram:relationships:v1:{connId}:{db}:{schema}` | 现有（保持不变） |
| 匹配确认记录 | `dbx:diagram:match-confirms:v1:{connId}:{db}:{schema}` | 新增 |
| 匹配忽略记录 | `dbx:diagram:match-ignores:v1:{connId}:{db}:{schema}` | 新增 |
| 用户自定义正则规则 | `dbx:diagram:match-rules:v1:{connId}:{db}:{schema}` | 新增 |
| 匹配全局开关 | `dbx:diagram:match-enabled` | 新增 |

---

## 六、风险与注意事项

### 6.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Vue Flow 迁移后样式不一致 | UI 风格不统一 | 严格沿用 shadcn-vue Button 规范 |
| ELK.js 打包体积过大 | 安装包增大 | 已评估：gzip ~50KB，影响约 1.7% |
| 撤销/重做性能问题 | 大 Schema 卡顿 | 使用 `cloneDeep` 快照，限制栈深度 50 |
| 后端改动影响现有功能 | 破坏现有 API | 仅新增，不修改现有命令 |

### 6.2 依赖检查

- ✅ `safeLocalStorageGet/Set/Remove`：已存在于 `lib/backend/safeStorage.ts`
- ✅ Pinia：已存在于项目中
- ✅ lodash-es：已通过 shadcn-vue 间接依赖
- ✅ lucide-vue-next：已存在于项目中

---

## 七、验证标准

### 7.1 单元测试

| 模块 | 测试用例 |
|------|----------|
| MatchEngine | TC-M1~M5：命名约定匹配、类型校验、冲突检测、物理外键优先、camelCase 支持 |
| MatchStorage | TC-MS1~MS3：存储与加载、互不干扰、全局开关默认值 |
| LayoutManager | TC-L1~L3：无重叠、正交边、pinned 节点位置不变 |
| GraphStore | TC-S1~S4：撤销恢复、redo 恢复、清空 redo、栈深度限制 |

### 7.2 功能验证

1. ER 图加载：节点数 = 表数
2. 智能匹配：无外键库显示虚线连线
3. ELK 布局：节点按层级排列
4. 框选：批量拖拽多个节点
5. 撤销/重做：Ctrl+Z/Y 正常工作
6. 匹配面板：确认后虚线变实线

---

## 八、分支管理

```bash
# 创建新分支
git checkout -b feature/er-diagram-enhancement

# 提交策略
# feat(diagram): Vue Flow 集成
# feat(diagram): 智能匹配引擎
# feat(diagram): ELK 布局
# feat(diagram): 撤销/重做
# feat(diagram): MatchPanel 面板
# feat(backend): get_all_columns API
# test(diagram): 匹配引擎单元测试
```

---

## 九、参考文档

- [DBX ER 图增强架构方案 v4](file:///workspace/dbx-er-diagram-architecture.html)
- [safeStorage.ts](file:///workspace/apps/desktop/src/lib/backend/safeStorage.ts)
- [erDiagram.ts](file:///workspace/apps/desktop/src/lib/diagram/erDiagram.ts)
- [SchemaDiagramDialog.vue](file:///workspace/apps/desktop/src/components/diagram/SchemaDiagramDialog.vue)
- [database.ts](file:///workspace/apps/desktop/src/types/database.ts)
- [schema.rs](file:///workspace/src-tauri/src/commands/schema.rs)