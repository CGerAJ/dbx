import { EDGE_POPOVER_CLOSE_DELAY_MS, EDGE_POPOVER_OPEN_DELAY_MS } from "./diagram-constants";

/**
 * Timer-based open/close scheduling for edge hover popovers.
 * Extracted for unit testing with fake timers.
 */
export function createEdgePopoverScheduler(options?: { openDelayMs?: number; closeDelayMs?: number }) {
  const openDelayMs = options?.openDelayMs ?? EDGE_POPOVER_OPEN_DELAY_MS;
  const closeDelayMs = options?.closeDelayMs ?? EDGE_POPOVER_CLOSE_DELAY_MS;

  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingEdgeId: string | null = null;

  function cancelOpen() {
    if (openTimer != null) clearTimeout(openTimer);
    openTimer = null;
    pendingEdgeId = null;
  }

  function cancelClose() {
    if (closeTimer != null) clearTimeout(closeTimer);
    closeTimer = null;
  }

  function cancelAll() {
    cancelOpen();
    cancelClose();
  }

  function scheduleOpen(edgeId: string, onOpen: (edgeId: string) => void) {
    cancelOpen();
    pendingEdgeId = edgeId;
    openTimer = setTimeout(() => {
      openTimer = null;
      if (pendingEdgeId !== edgeId) return;
      onOpen(edgeId);
      pendingEdgeId = null;
    }, openDelayMs);
  }

  function scheduleClose(shouldClose: () => boolean, onClose: () => void) {
    cancelClose();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (!shouldClose()) return;
      onClose();
    }, closeDelayMs);
  }

  return {
    scheduleOpen,
    scheduleClose,
    cancelOpen,
    cancelClose,
    cancelAll,
    getPendingEdgeId: () => pendingEdgeId,
  };
}

export type EdgePopoverScheduler = ReturnType<typeof createEdgePopoverScheduler>;
