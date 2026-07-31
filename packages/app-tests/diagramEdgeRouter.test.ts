import { strict as assert } from "node:assert";
import { test } from "vitest";
import { Position } from "@vue-flow/core";
import {
  alignWaypointsToEndpoints,
  dedupePoints,
  handlesFromWaypoints,
  pathHitsObstacles,
  pointsToSvgPath,
  routeOrthogonalAroundObstacles,
  type ObstacleRect,
} from "../../apps/desktop/src/lib/diagram/edge-obstacle-router.ts";

test("pointsToSvgPath and dedupePoints", () => {
  assert.equal(pointsToSvgPath([]), "");
  assert.equal(pointsToSvgPath([{ x: 1, y: 2 }, { x: 3, y: 4 }]), "M1,2 L3,4");
  assert.deepEqual(
    dedupePoints([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10.2, y: 0 },
    ]),
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  );
});

test("pathHitsObstacles detects crossing segments", () => {
  const obstacle: ObstacleRect = {
    id: "block",
    x: 40,
    y: 40,
    width: 100,
    height: 100,
    kind: "table",
  };
  assert.equal(
    pathHitsObstacles(
      [
        { x: 0, y: 90 },
        { x: 200, y: 90 },
      ],
      [obstacle],
    ),
    true,
  );
  assert.equal(
    pathHitsObstacles(
      [
        { x: 0, y: 10 },
        { x: 200, y: 10 },
      ],
      [obstacle],
    ),
    false,
  );
});

test("routeOrthogonalAroundObstacles returns a clear orthogonal path", () => {
  const obstacle: ObstacleRect = {
    id: "mid",
    x: 80,
    y: 40,
    width: 40,
    height: 40,
    kind: "table",
  };
  // Direct horizontal at y=0 clears the obstacle; router should pick a non-null path.
  const path = routeOrthogonalAroundObstacles({
    source: { x: 0, y: 0 },
    target: { x: 200, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    obstacles: [obstacle],
    endpointIds: ["a", "b"],
  });
  assert.ok(path);
  assert.ok(path!.length >= 2);
  assert.equal(pathHitsObstacles(path!, [obstacle]), false);
});

test("handlesFromWaypoints and alignWaypointsToEndpoints", () => {
  const handles = handlesFromWaypoints([
    { x: 0, y: 50 },
    { x: 40, y: 50 },
    { x: 40, y: 100 },
    { x: 120, y: 100 },
  ]);
  assert.deepEqual(handles, { sourceHandle: "right", targetHandle: "left-target" });
  assert.equal(handlesFromWaypoints([{ x: 0, y: 0 }]), null);

  const aligned = alignWaypointsToEndpoints(
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 80 },
    ],
    10,
    20,
    200,
    90,
  );
  assert.ok(aligned);
  assert.deepEqual(aligned![0], { x: 10, y: 20 });
  assert.deepEqual(aligned![aligned!.length - 1], { x: 200, y: 90 });
});
