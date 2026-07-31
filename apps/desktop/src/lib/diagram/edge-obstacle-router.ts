import { Position } from "@vue-flow/core";
import { EDGE_ROUTE_OFFSET } from "./diagram-constants";

export type Point = { x: number; y: number };

export type ObstacleRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "table" | "layer";
  /** For layers: tables contained (used to skip same-layer fill) */
  tableNames?: string[];
};

export type RouteInput = {
  source: Point;
  target: Point;
  sourcePosition: Position;
  targetPosition: Position;
  obstacles: ObstacleRect[];
  /** Endpoint table ids to ignore as obstacles */
  endpointIds: [string, string];
  offset?: number;
};

const AXIS_EPS = 0.5;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= AXIS_EPS;
}

function inflate(rect: ObstacleRect, pad: number): ObstacleRect {
  return {
    ...rect,
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

function segmentIntersectsRect(a: Point, b: Point, rect: ObstacleRect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;

  if (maxX < rect.x || minX > rx2 || maxY < rect.y || minY > ry2) return false;

  if (nearlyEqual(a.x, b.x)) {
    const x = a.x;
    return x >= rect.x && x <= rx2 && maxY >= rect.y && minY <= ry2;
  }
  if (nearlyEqual(a.y, b.y)) {
    const y = a.y;
    return y >= rect.y && y <= ry2 && maxX >= rect.x && minX <= rx2;
  }
  return true;
}

export function pathHitsObstacles(points: Point[], obstacles: ObstacleRect[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const rect of obstacles) {
      if (segmentIntersectsRect(points[i], points[i + 1], rect)) return true;
    }
  }
  return false;
}

function relevantObstacles(input: RouteInput, pad: number): ObstacleRect[] {
  const [srcId, tgtId] = input.endpointIds;
  return input.obstacles
    .filter((o) => {
      if (o.kind === "table") {
        return o.id !== srcId && o.id !== tgtId;
      }
      const names = o.tableNames || [];
      if (names.includes(srcId) || names.includes(tgtId)) return false;
      return true;
    })
    .map((o) => inflate(o, pad));
}

/**
 * Build candidate orthogonal polylines; return the first that clears obstacles,
 * or null to let the caller fall back to getSmoothStepPath.
 */
export function routeOrthogonalAroundObstacles(input: RouteInput): Point[] | null {
  const offset = input.offset ?? EDGE_ROUTE_OFFSET;
  const obstacles = relevantObstacles(input, 6);
  const { source: s, target: t } = input;

  const candidates: Point[][] = [
    [s, { x: t.x, y: s.y }, t],
    [s, { x: s.x, y: t.y }, t],
    [s, { x: s.x + offset, y: s.y }, { x: s.x + offset, y: t.y }, t],
    [s, { x: s.x - offset, y: s.y }, { x: s.x - offset, y: t.y }, t],
    [s, { x: s.x, y: s.y + offset }, { x: t.x, y: s.y + offset }, t],
    [s, { x: s.x, y: s.y - offset }, { x: t.x, y: s.y - offset }, t],
    [s, { x: t.x + offset, y: s.y }, { x: t.x + offset, y: t.y }, t],
    [s, { x: t.x - offset, y: s.y }, { x: t.x - offset, y: t.y }, t],
    [s, { x: s.x, y: Math.min(s.y, t.y) - offset }, { x: t.x, y: Math.min(s.y, t.y) - offset }, t],
    [s, { x: s.x, y: Math.max(s.y, t.y) + offset }, { x: t.x, y: Math.max(s.y, t.y) + offset }, t],
  ];

  if (input.sourcePosition === Position.Right) {
    candidates.unshift([s, { x: Math.max(s.x, t.x) + offset, y: s.y }, { x: Math.max(s.x, t.x) + offset, y: t.y }, t]);
  } else if (input.sourcePosition === Position.Left) {
    candidates.unshift([s, { x: Math.min(s.x, t.x) - offset, y: s.y }, { x: Math.min(s.x, t.x) - offset, y: t.y }, t]);
  } else if (input.sourcePosition === Position.Bottom) {
    candidates.unshift([s, { x: s.x, y: Math.max(s.y, t.y) + offset }, { x: t.x, y: Math.max(s.y, t.y) + offset }, t]);
  } else if (input.sourcePosition === Position.Top) {
    candidates.unshift([s, { x: s.x, y: Math.min(s.y, t.y) - offset }, { x: t.x, y: Math.min(s.y, t.y) - offset }, t]);
  }

  for (const path of candidates) {
    const cleaned = dedupePoints(path);
    if (cleaned.length < 2) continue;
    if (!pathHitsObstacles(cleaned, obstacles)) return cleaned;
  }

  return null;
}

export function dedupePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || !nearlyEqual(last.x, p.x) || !nearlyEqual(last.y, p.y)) {
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

function isOrthogonalPolyline(points: Point[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!nearlyEqual(a.x, b.x) && !nearlyEqual(a.y, b.y)) return false;
  }
  return true;
}

/** Orthogonal elbow from a → b (try both corners; prefer shorter). */
function orthogonalConnect(a: Point, b: Point): Point[] {
  if (nearlyEqual(a.x, b.x) || nearlyEqual(a.y, b.y)) return [a, b];
  const viaH: Point[] = [a, { x: b.x, y: a.y }, b];
  const viaV: Point[] = [a, { x: a.x, y: b.y }, b];
  const len = (pts: Point[]) => pts.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)), 0);
  return len(viaH) <= len(viaV) ? viaH : viaV;
}

/**
 * Infer Vue Flow handle ids from ELK waypoint exit/entry directions.
 */
export function handlesFromWaypoints(waypoints: Point[]): { sourceHandle: string; targetHandle: string } | null {
  if (waypoints.length < 2) return null;
  const a = waypoints[0];
  const b = waypoints[1];
  const c = waypoints[waypoints.length - 2];
  const d = waypoints[waypoints.length - 1];

  const outDx = b.x - a.x;
  const outDy = b.y - a.y;
  let sourceHandle: string;
  if (Math.abs(outDx) >= Math.abs(outDy)) {
    sourceHandle = outDx >= 0 ? "right" : "left";
  } else {
    sourceHandle = outDy >= 0 ? "bottom" : "top";
  }

  const inDx = d.x - c.x;
  const inDy = d.y - c.y;
  let targetHandle: string;
  if (Math.abs(inDx) >= Math.abs(inDy)) {
    // Arriving with +dx means coming from the left → hit left side
    targetHandle = inDx >= 0 ? "left-target" : "right-target";
  } else {
    targetHandle = inDy >= 0 ? "top-target" : "bottom-target";
  }

  return { sourceHandle, targetHandle };
}

export type AlignWaypointsOptions = {
  obstacles?: ObstacleRect[];
  endpointIds?: [string, string];
};

/**
 * Attach live Vue Flow handle endpoints to ELK interior bends with orthogonal elbows.
 * Does NOT translate the whole polyline by source delta (that caused diagonals / V shapes).
 * Returns null when the result is unusable (caller should fall back to obstacle router).
 */
export function alignWaypointsToEndpoints(waypoints: Point[], sourceX: number, sourceY: number, targetX: number, targetY: number, options?: AlignWaypointsOptions): Point[] | null {
  if (waypoints.length < 2) return null;

  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const interior = waypoints.slice(1, -1);

  let merged: Point[];
  if (interior.length === 0) {
    merged = dedupePoints(orthogonalConnect(source, target));
  } else {
    const head = orthogonalConnect(source, interior[0]);
    const tail = orthogonalConnect(interior[interior.length - 1], target);
    merged = dedupePoints([...head.slice(0, -1), ...interior, ...tail.slice(1)]);
  }

  if (merged.length < 2 || !isOrthogonalPolyline(merged)) return null;

  if (options?.obstacles?.length && options.endpointIds) {
    const obstacles = relevantObstacles(
      {
        source,
        target,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        obstacles: options.obstacles,
        endpointIds: options.endpointIds,
      },
      4,
    );
    if (pathHitsObstacles(merged, obstacles)) return null;
  }

  return merged;
}

export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

export function midpointAlongPolyline(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push(d);
    total += d;
  }
  if (total === 0) return points[0];
  let remain = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (remain <= segs[i]) {
      const t = segs[i] === 0 ? 0 : remain / segs[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    remain -= segs[i];
  }
  return points[points.length - 1];
}
