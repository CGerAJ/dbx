import { strict as assert } from "node:assert";
import { test } from "vitest";
import { resolveDiagramDialectAdapter } from "../../apps/desktop/src/lib/diagram/diagram-dialect-adapter.ts";

test("resolveDiagramDialectAdapter default id types by dialect", () => {
  assert.equal(resolveDiagramDialectAdapter("postgres").createDefaultIdColumn().data_type, "bigint");
  assert.equal(resolveDiagramDialectAdapter("mysql").createDefaultIdColumn().data_type, "bigint");
  // Prefer dialect default when listed; otherwise first integer-like option (Oracle often exposes "number").
  assert.match(resolveDiagramDialectAdapter("oracle").createDefaultIdColumn().data_type, /^number$/i);
  assert.match(resolveDiagramDialectAdapter("sqlite").createDefaultIdColumn().data_type, /^integer$/i);
  assert.match(resolveDiagramDialectAdapter("clickhouse").createDefaultIdColumn().data_type, /^uint64$/i);
});

test("resolveDiagramDialectAdapter unknown dialect falls back with capabilities", () => {
  const adapter = resolveDiagramDialectAdapter(undefined);
  const id = adapter.createDefaultIdColumn();
  assert.equal(id.name, "id");
  assert.equal(id.is_primary_key, true);
  assert.ok(typeof id.data_type === "string" && id.data_type.length > 0);
  assert.equal(typeof adapter.supportsCreateTable, "boolean");
  assert.equal(typeof adapter.supportsCreateIndex, "boolean");
  assert.equal(typeof adapter.supportsComment, "boolean");
});

test("resolveDiagramDialectAdapter createEmptyColumn defaults", () => {
  const col = resolveDiagramDialectAdapter("postgres").createEmptyColumn("foo");
  assert.equal(col.name, "foo");
  assert.equal(col.is_primary_key, false);
  assert.equal(col.is_nullable, true);
  assert.ok(col.data_type);
});

test("postgres supports create index, comment, and drop column", () => {
  const adapter = resolveDiagramDialectAdapter("postgres");
  assert.equal(adapter.supportsCreateIndex, true);
  assert.equal(adapter.supportsComment, true);
  assert.equal(adapter.supportsDropColumn, true);
});
