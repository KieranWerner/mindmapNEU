/** --- Typen --- */
export type MindNode = {
  id: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  strokeColor: string;
  fillColor?: string;
  bold?: boolean;
};

export type Link = {
  id: number;
  source: number;
  target: number;
  label?: string;
  dashed?: boolean;
  arrow?: boolean;
};

export type Snapshot = {
  nodes: MindNode[];
  edges: Link[];
  pan: { x: number; y: number };
  scale: number;
  selectedId: number | null;
  selectedIds: number[];
  selectedEdgeIds: number[];
};

export type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  wx?: number;
  wy?: number;
  kind: "bg" | "node" | "edge";
  targetNodeId?: number;
  targetEdgeId?: number;
};

export type MarqueeState = {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type LinkingState = {
  phase: "idle" | "pending" | "active";
  sourceId: number | null;
  x: number;
  y: number;
  startX: number;
  startY: number;
};

export type Clipboard = {
  nodes: MindNode[];
  edges: Link[];
} | null;
