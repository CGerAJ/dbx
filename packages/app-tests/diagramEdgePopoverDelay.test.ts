import { strict as assert } from "node:assert";
import { afterEach, test, vi } from "vitest";
import { createEdgePopoverScheduler } from "../../apps/desktop/src/lib/diagram/edge-popover-schedule.ts";
import { EDGE_POPOVER_CLOSE_DELAY_MS, EDGE_POPOVER_OPEN_DELAY_MS } from "../../apps/desktop/src/lib/diagram/diagram-constants.ts";

afterEach(() => {
  vi.useRealTimers();
});

test("edge popover delay constants", () => {
  assert.equal(EDGE_POPOVER_OPEN_DELAY_MS, 400);
  assert.equal(EDGE_POPOVER_CLOSE_DELAY_MS, 220);
});

test("scheduleOpen does not fire before open delay", () => {
  vi.useFakeTimers();
  const scheduler = createEdgePopoverScheduler();
  const opened: string[] = [];
  scheduler.scheduleOpen("e1", (id) => opened.push(id));

  vi.advanceTimersByTime(EDGE_POPOVER_OPEN_DELAY_MS - 1);
  assert.deepEqual(opened, []);

  vi.advanceTimersByTime(1);
  assert.deepEqual(opened, ["e1"]);
});

test("cancelOpen prevents delayed open", () => {
  vi.useFakeTimers();
  const scheduler = createEdgePopoverScheduler();
  const opened: string[] = [];
  scheduler.scheduleOpen("e1", (id) => opened.push(id));
  scheduler.cancelOpen();
  vi.advanceTimersByTime(EDGE_POPOVER_OPEN_DELAY_MS + 50);
  assert.deepEqual(opened, []);
});

test("scheduleClose respects shouldClose and close delay", () => {
  vi.useFakeTimers();
  const scheduler = createEdgePopoverScheduler();
  let closed = false;
  let allowClose = false;
  scheduler.scheduleClose(
    () => allowClose,
    () => {
      closed = true;
    },
  );

  vi.advanceTimersByTime(EDGE_POPOVER_CLOSE_DELAY_MS);
  assert.equal(closed, false);

  allowClose = true;
  scheduler.scheduleClose(
    () => allowClose,
    () => {
      closed = true;
    },
  );
  vi.advanceTimersByTime(EDGE_POPOVER_CLOSE_DELAY_MS - 1);
  assert.equal(closed, false);
  vi.advanceTimersByTime(1);
  assert.equal(closed, true);
});
