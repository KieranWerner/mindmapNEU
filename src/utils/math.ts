import type { MindNode } from "../types";

/** --- Math Utilities --- */
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));

export const approxTextWidth = (text: string, fontSize: number) =>
  text.length * fontSize * 0.6;

export const rectRadius = (n: MindNode) => Math.max(n.w, n.h) / 2;

export function distPointToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const vx = x2 - x1,
    vy = y2 - y1;
  const wx = px - x1,
    wy = py - y1;
  const len2 = vx * vx + vy * vy || 1e-6;
  let t = (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * vx,
    cy = y1 + t * vy;
  return Math.hypot(px - cx, py - cy);
}

export function getCentroidAndDistance(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return { cx: 0, cy: 0, d: 0 };
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const d = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  return { cx, cy, d };
}

// Helper: Berechnet Schnittpunkt Linie <-> Rechteck (für saubere Pfeile)
export function getRectIntersection(s: MindNode, t: MindNode) {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { x: t.x, y: t.y };

  const angle = Math.atan2(dy, dx);
  const w = t.w / 2;
  const h = t.h / 2;

  const tan = Math.abs(Math.tan(angle));
  const aspect = h / w;

  let endX = 0;
  let endY = 0;

  if (tan < aspect) {
    const sign = Math.cos(angle) > 0 ? 1 : -1;
    endX = t.x - sign * w;
    endY = t.y - sign * w * Math.tan(angle);
  } else {
    const sign = Math.sin(angle) > 0 ? 1 : -1;
    endX = t.x - sign * h / Math.tan(angle);
    endY = t.y - sign * h;
  }
  return { x: endX, y: endY };
}
