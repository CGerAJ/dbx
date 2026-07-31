import { strict as assert } from "node:assert";
import { test } from "vitest";
import { buildEngineeringDiagram } from "../../apps/desktop/src/lib/diagram/engineeringDiagram.ts";
import {
  buildEngineeringDiagramSvg,
  buildTableDiagramSvg,
  buildTableRelationshipPaths,
  computeTableDiagramCanvas,
} from "../../apps/desktop/src/lib/export/diagramSvgExport.ts";
import { buildDiagramRelationships, type DiagramTable } from "../../apps/desktop/src/lib/diagram/erDiagram.ts";
import { pointsToSvgPath } from "../../apps/desktop/src/lib/diagram/edge-obstacle-router.ts";
import { CARD_HEADER_HEIGHT, CARD_WIDTH, COLUMN_ROW_HEIGHT, MARGIN } from "../../apps/desktop/src/lib/diagram/diagram-constants.ts";

const tables: DiagramTable[] = [
  {
    name: "users",
    columns: [
      { name: "id", data_type: "bigint", is_nullable: false, column_default: null, is_primary_key: true, extra: null },
      { name: "name & note", data_type: "varchar", is_nullable: true, column_default: null, is_primary_key: false, extra: null },
    ],
    foreignKeys: [],
  },
  {
    name: "orders",
    columns: [
      { name: "id", data_type: "bigint", is_nullable: false, column_default: null, is_primary_key: true, extra: null },
      { name: "user_id", data_type: "bigint", is_nullable: false, column_default: null, is_primary_key: false, extra: null },
    ],
    foreignKeys: [{ name: "orders_user_id_fk", column: "user_id", ref_table: "users", ref_column: "id" }],
  },
];

test("exports the table diagram as standalone SVG", () => {
  const relationships = buildDiagramRelationships(tables);
  const svg = buildTableDiagramSvg({
    tables,
    relationships,
    positions: {
      users: { x: 40, y: 40 },
      orders: { x: 360, y: 40 },
    },
    relationshipPaths: {
      [relationships[0].id]: "M 360 96 L 310 96",
    },
    canvas: { width: 720, height: 320 },
    cardWidth: 270,
    cardHeaderHeight: 44,
    columnRowHeight: 24,
  });

  assert.match(svg, /^<svg /);
  assert.match(svg, /<path d="M 360 96 L 310 96"/);
  assert.match(svg, />users</);
  assert.match(svg, />orders</);
  assert.match(svg, />name &amp; note</);
  assert.match(svg, />PK</);
  assert.match(svg, />FK</);
  assert.doesNotMatch(svg, /<foreignObject/);
});

test("omits relationship paths when relationshipPaths entry is missing", () => {
  const relationships = buildDiagramRelationships(tables);
  const svg = buildTableDiagramSvg({
    tables,
    relationships,
    positions: {
      users: { x: 40, y: 40 },
      orders: { x: 360, y: 40 },
    },
    relationshipPaths: {},
    canvas: { width: 720, height: 320 },
    cardWidth: CARD_WIDTH,
    cardHeaderHeight: CARD_HEADER_HEIGHT,
    columnRowHeight: COLUMN_ROW_HEIGHT,
  });

  assert.doesNotMatch(svg, /marker-end="url\(#dbx-diagram-arrow\)"/);
});

test("draws visible layers and skips zero-size layers", () => {
  const svg = buildTableDiagramSvg({
    tables: [tables[0]],
    relationships: [],
    positions: { users: { x: 40, y: 40 } },
    relationshipPaths: {},
    canvas: { width: 800, height: 600 },
    cardWidth: CARD_WIDTH,
    cardHeaderHeight: CARD_HEADER_HEIGHT,
    columnRowHeight: COLUMN_ROW_HEIGHT,
    layers: [
      { id: "l1", name: "Core", color: "#3b82f6", x: 10, y: 10, width: 400, height: 200 },
      { id: "l0", name: "Empty", color: "#ef4444", x: 0, y: 0, width: 0, height: 0 },
    ],
  });

  assert.match(svg, /class="diagram-layers"/);
  assert.match(svg, />Core</);
  assert.doesNotMatch(svg, />Empty</);
});

test("exports the engineering ER diagram with Chen-style shapes and cardinalities", () => {
  const relationships = buildDiagramRelationships(tables);
  const diagram = buildEngineeringDiagram(tables, relationships, {
    users: { x: 40, y: 40 },
    orders: { x: 360, y: 40 },
  });
  const svg = buildEngineeringDiagramSvg(diagram);

  assert.match(svg, /^<svg /);
  assert.match(svg, /<ellipse /);
  assert.match(svg, /<polygon /);
  assert.match(svg, /<rect /);
  assert.match(svg, />N</);
  assert.match(svg, />1</);
  assert.match(svg, /text-decoration="underline"/);
  assert.doesNotMatch(svg, /<foreignObject/);
});

test("buildTableRelationshipPaths uses waypoints when length >= 2", () => {
  const relationships = buildDiagramRelationships(tables);
  const waypoints = [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
  ];
  const paths = buildTableRelationshipPaths({
    relationships,
    positions: {
      users: { x: 40, y: 40 },
      orders: { x: 400, y: 40 },
    },
    tables,
    waypoints: { [relationships[0].id]: waypoints },
  });

  assert.equal(paths[relationships[0].id], pointsToSvgPath(waypoints));
});

test("buildTableRelationshipPaths falls back to orthogonal path when waypoints are insufficient", () => {
  const relationships = buildDiagramRelationships(tables);
  const paths = buildTableRelationshipPaths({
    relationships,
    positions: {
      users: { x: 40, y: 40 },
      orders: { x: 400, y: 40 },
    },
    tables,
    waypoints: { [relationships[0].id]: [{ x: 0, y: 0 }] },
  });

  assert.ok(paths[relationships[0].id]);
  assert.match(paths[relationships[0].id], /^M/);
  assert.notEqual(paths[relationships[0].id], pointsToSvgPath([{ x: 0, y: 0 }]));
});

test("buildTableRelationshipPaths skips relationships with missing positions", () => {
  const relationships = buildDiagramRelationships(tables);
  const paths = buildTableRelationshipPaths({
    relationships,
    positions: { users: { x: 40, y: 40 } },
    tables,
  });

  assert.equal(paths[relationships[0].id], undefined);
});

test("computeTableDiagramCanvas uses default floor and MARGIN padding", () => {
  const canvas = computeTableDiagramCanvas([], {}, {
    cardWidth: CARD_WIDTH,
    cardHeaderHeight: CARD_HEADER_HEIGHT,
    columnRowHeight: COLUMN_ROW_HEIGHT,
  });

  assert.deepEqual(canvas, { width: 400 + MARGIN, height: 300 + MARGIN });
});

test("computeTableDiagramCanvas expands for tables and ignores zero-size layers", () => {
  const withTable = computeTableDiagramCanvas(
    [tables[0]],
    { users: { x: 1000, y: 800 } },
    {
      cardWidth: CARD_WIDTH,
      cardHeaderHeight: CARD_HEADER_HEIGHT,
      columnRowHeight: COLUMN_ROW_HEIGHT,
      layers: [{ id: "z", name: "z", color: "#000", x: 0, y: 0, width: 0, height: 0 }],
    },
  );
  assert.ok(withTable.width >= 1000 + CARD_WIDTH + MARGIN);
  assert.ok(withTable.height >= 800 + MARGIN);

  const withLayer = computeTableDiagramCanvas([], {}, {
    cardWidth: CARD_WIDTH,
    cardHeaderHeight: CARD_HEADER_HEIGHT,
    columnRowHeight: COLUMN_ROW_HEIGHT,
    layers: [{ id: "big", name: "big", color: "#000", x: 0, y: 0, width: 2000, height: 1500 }],
  });
  assert.equal(withLayer.width, 2000 + MARGIN);
  assert.equal(withLayer.height, 1500 + MARGIN);
});
