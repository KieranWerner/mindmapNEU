import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** --- Typen --- */
type MindNode = {
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

type Link = {
  id: number;
  source: number;
  target: number;
  label?: string;
  dashed?: boolean;
  arrow?: boolean;
};

type Snapshot = {
  nodes: MindNode[];
  edges: Link[];
  pan: { x: number; y: number };
  scale: number;
  selectedId: number | null;
  selectedIds: number[];
  selectedEdgeIds: number[];
};

/** --- Konstanten --- */
const STORAGE_KEY = "mindmap_v16_final";
const BASE_W = 120;
const BASE_H = 64;
const DRAG_THRESHOLD = 16;
const CHILD_RADIUS = 160;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** --- Utilities --- */
const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
const approxTextWidth = (text: string, fontSize: number) =>
  text.length * fontSize * 0.6;

function layoutLabel(label: string, baseFont: number, minW: number) {
  const maxLines = 3;
  const paddingX = 16;
  const paddingY = 12;
  const lineHeight = Math.round(baseFont * 1.15);

  const words = label.split(/\s+/).filter(Boolean);
  let lines: string[] = [];
  let width = Math.max(minW, BASE_W);

  const rebuild = () => {
    lines = [];
    let current = "";
    for (const w of (words.length ? words : [label])) {
      const test = current ? current + " " + w : w;
      if (approxTextWidth(test, baseFont) <= width - paddingX * 2) current = test;
      else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);

    if (lines.length > maxLines) {
      const textLen = label.replace(/\s+/g, " ").trim().length || 1;
      const targetCharsPerLine = Math.ceil(textLen / maxLines);
      width = Math.max(
        width,
        Math.ceil(targetCharsPerLine * baseFont * 0.6 + paddingX * 2)
      );
      return false;
    }
    return true;
  };

  for (let i = 0; i < 6; i++) {
    if (rebuild()) break;
  }

  const textW = Math.max(
    ...lines.map((t) => approxTextWidth(t, baseFont)),
    0
  );
  width = Math.max(width, Math.ceil(textW + paddingX * 2));
  const height = Math.max(
    BASE_H,
    Math.ceil(lines.length * lineHeight + paddingY * 2)
  );
  return {
    lines: lines.length ? lines : [""],
    width,
    height,
    lineHeight,
    paddingX,
    paddingY,
    fontSize: baseFont,
  };
}

function hexToRgba60(hex: string) {
  const m = hex.replace("#", "");
  const bigint = parseInt(
    m.length === 3 ? m.split("").map((c) => c + c).join("") : m,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},0.6)`;
}

function distPointToSeg(
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

const rectRadius = (n: MindNode) => Math.max(n.w, n.h) / 2;
const cloneSnapshot = (s: Snapshot): Snapshot =>
  JSON.parse(JSON.stringify(s));

// Helper: Berechnet Schnittpunkt Linie <-> Rechteck (für saubere Pfeile)
function getRectIntersection(s: MindNode, t: MindNode) {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { x: t.x, y: t.y };

  const angle = Math.atan2(dy, dx);
  const w = (t.w / 2); 
  const h = (t.h / 2); 

  const tan = Math.abs(Math.tan(angle));
  const aspect = h / w;

  let endX = 0;
  let endY = 0;

  if (tan < aspect) {
    const sign = Math.cos(angle) > 0 ? 1 : -1;
    endX = t.x - (sign * w);
    endY = t.y - (sign * w * Math.tan(angle));
  } else {
    const sign = Math.sin(angle) > 0 ? 1 : -1;
    endX = t.x - (sign * h / Math.tan(angle));
    endY = t.y - (sign * h);
  }
  return { x: endX, y: endY };
}

/** --- App --- */
export default function App() {
  /** State */
  const [nodes, setNodes] = useState<MindNode[]>([
    {
      id: 1,
      label: "Start",
      x: 0,
      y: 0,
      w: BASE_W,
      h: BASE_H,
      strokeColor: "#333",
      fillColor: undefined,
      bold: false,
    },
  ]);
  const [edges, setEdges] = useState<Link[]>([]);

  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set([1])
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<number>>(
    new Set()
  );

  const [clipboard, setClipboard] = useState<{ nodes: MindNode[], edges: Link[] } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  /** Pan & Zoom */
  const [pan, setPan] = useState(() => ({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  }));
  const [scale, setScale] = useState(1);

  /** Refs */
  const shiftTabPathRef = useRef<number[] | null>(null);
  const shiftTabIndexRef = useRef<number>(0);
  const prevSelectedIdRef = useRef<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingNodeId = useRef<number | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const somethingMoved = useRef<boolean>(false);

  const groupDragging = useRef(false);
  const groupStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const groupStartPositions = useRef<
    { id: number; x: number; y: number }[]
  >([]);

  const panning = useRef(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panAtStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeTouches = useRef<
    Map<number, { x: number; y: number }>
  >(new Map());
  const pinchStart = useRef<{
    d: number;
    scale: number;
    panX: number;
    panY: number;
    cx: number;
    cy: number;
  } | null>(null);

  const [marquee, setMarquee] = useState<{
    active: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>({ active: false, x1: 0, y1: 0, x2: 0, y2: 0 });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const [linking, setLinking] = useState<{
    phase: "idle" | "pending" | "active";
    sourceId: number | null;
    x: number;
    y: number;
    startX: number;
    startY: number;
  }>({
    phase: "idle",
    sourceId: null,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
  });

  const freshTyping = useRef<boolean>(true);

  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);

  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    wx?: number;
    wy?: number;
    kind: "bg" | "node" | "edge";
    targetNodeId?: number;
    targetEdgeId?: number;
  }>({ open: false, x: 0, y: 0, kind: "bg" });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Persistenz & Init */
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.nodes) && Array.isArray(data?.edges)) {
        setNodes(data.nodes);
        setEdges(data.edges);
      }
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
  }, [nodes, edges]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setPan({ x: rect.width / 2, y: rect.height / 2 });
    setScale(1);
  }, []);

  /** Helpers */
  function toWorld(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    };
  }
  function toScreen(wx: number, wy: number) {
    return { x: pan.x + wx * scale, y: pan.y + wy * scale };
  }
  function bringBoxIntoView(
    cx: number,
    cy: number,
    w: number,
    h: number,
    margin = 24
  ) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const left = toScreen(cx - w / 2, cy - h / 2);
    const right = toScreen(cx + w / 2, cy + h / 2);
    let newPanX = pan.x,
      newPanY = pan.y;
    if (left.x < margin) newPanX += margin - left.x;
    if (right.x > rect.width - margin)
      newPanX -= right.x - (rect.width - margin);
    if (left.y < margin) newPanY += margin - left.y;
    if (right.y > rect.height - margin)
      newPanY -= right.y - (rect.height - margin);
    if (newPanX !== pan.x || newPanY !== pan.y)
      setPan({ x: newPanX, y: newPanY });
  }
  function getCentroidAndDistance(points: { x: number; y: number }[]) {
    const cx = (points[0].x + points[1].x) / 2;
    const cy = (points[0].y + points[1].y) / 2;
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const d = Math.hypot(dx, dy);
    return { cx, cy, d };
  }
  function selectOnly(id: number) {
    shiftTabPathRef.current = null;
    shiftTabIndexRef.current = 0;
    if (selectedId != null && selectedId !== id) {
      prevSelectedIdRef.current = selectedId;
    }
    setSelectedId(id);
    setSelectedIds(new Set([id]));
    setSelectedEdgeIds(new Set());
    freshTyping.current = true;
  }
  function clearSelection() {
    setSelectedId(null);
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
    freshTyping.current = true;
  }
  function selectFromArray(ids: number[]) {
    setSelectedId(ids[0] ?? null);
    setSelectedIds(new Set(ids));
    setSelectedEdgeIds(new Set());
    freshTyping.current = true;
  }
  function isPositionFree(x: number, y: number, parentId?: number) {
    const NODE_PADDING = 8;
    const EDGE_PADDING = 6;
    for (const n of nodes) {
      if (n.id === parentId) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      const newR = Math.max(BASE_W, BASE_H) / 2;
      if (d < rectRadius(n) + newR + NODE_PADDING) return false;
    }
    for (const e of edges) {
      if (parentId && (e.source === parentId || e.target === parentId))
        continue;
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) continue;
      const d = distPointToSeg(x, y, s.x, s.y, t.x, t.y);
      if (d < Math.max(BASE_W, BASE_H) / 2 + EDGE_PADDING) return false;
    }
    return true;
  }
  
  function ensureEdge(a: number, b: number, isArrow = false) {
    if (a === b) return;
    const exists = edges.some(
      (ed) =>
        (ed.source === a && ed.target === b) ||
        (ed.source === b && ed.target === a)
    );
    if (!exists)
      setEdges((es) => [...es, { id: Date.now(), source: a, target: b, arrow: isArrow }]);
  }
  
  function getParentId(childId: number): number | null {
    const e = edges.find((ed) => ed.target === childId);
    return e ? e.source : null;
  }
  function getChildrenOf(parentId: number): number[] {
    return edges
      .filter((e) => e.source === parentId)
      .map((e) => e.target)
      .sort((a, b) => a - b);
  }
  function buildRootPath(startId: number): number[] {
    const up: number[] = [];
    let cur: number | null = startId;
    while (cur != null) {
      up.push(cur);
      cur = getParentId(cur);
    }
    return up.reverse();
  }
  function resizeNodeForLabel(n: MindNode): MindNode {
    const baseFont = clamp(Math.round(n.h * 0.35), 12, 20);
    const L = layoutLabel(n.label, baseFont, BASE_W);
    return { ...n, w: L.width, h: L.height };
  }
  function isPointInNode(n: MindNode, x: number, y: number) {
    return Math.abs(x - n.x) <= n.w / 2 && Math.abs(y - n.y) <= n.h / 2;
  }
  function findNodeAt(x: number, y: number, excludeId?: number): number | null {
    for (const n of nodes) {
      if (excludeId && n.id === excludeId) continue;
      if (isPointInNode(n, x, y)) return n.id;
    }
    return null;
  }

  /** History */
  function snapshot(): Snapshot {
    return {
      nodes,
      edges,
      pan: { ...pan },
      scale,
      selectedId,
      selectedIds: Array.from(selectedIds),
      selectedEdgeIds: Array.from(selectedEdgeIds),
    };
  }
  function pushHistory() {
    undoStack.current.push(cloneSnapshot(snapshot()));
    redoStack.current = [];
  }
  function restore(s: Snapshot) {
    setNodes(s.nodes);
    setEdges(s.edges);
    setPan(s.pan);
    setScale(s.scale);
    setSelectedId(s.selectedId);
    setSelectedIds(new Set(s.selectedIds));
    setSelectedEdgeIds(new Set(s.selectedEdgeIds));
  }
  function undo() {
    const s = undoStack.current.pop();
    if (!s) return;
    redoStack.current.push(cloneSnapshot(snapshot()));
    restore(s);
  }
  function redo() {
    const s = redoStack.current.pop();
    if (!s) return;
    undoStack.current.push(cloneSnapshot(snapshot()));
    restore(s);
  }

  /** Export/Import */
  function exportToFile() {
    if (typeof window === "undefined") return;
    const data: Snapshot = snapshot();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `mindmap-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importFromText(text: string) {
    try {
      const raw = JSON.parse(text);
      if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return;
      if (raw.pan) {
        const snap: Snapshot = {
          nodes: raw.nodes, edges: raw.edges, pan: raw.pan, scale: raw.scale,
          selectedId: raw.selectedId ?? null, selectedIds: raw.selectedIds ?? [], selectedEdgeIds: raw.selectedEdgeIds ?? [],
        };
        restore(snap);
      } else {
        setNodes(raw.nodes); setEdges(raw.edges); setPan({ x: 0, y: 0 }); setScale(1); clearSelection();
      }
    } catch {}
  }
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importFromText(String(ev.target?.result || ""));
      e.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  /** Add Functions */
  function addStandalone(at?: { x: number; y: number }): number {
    pushHistory();
    const newId = nodes.length ? Math.max(...nodes.map((n) => n.id)) + 1 : 1;
    let x: number, y: number;
    if (at) {
      x = at.x; y = at.y;
      if (!isPositionFree(x, y)) { /* Placement logic omitted */ }
    } else {
      const svg = svgRef.current;
      if (!svg) return 1;
      const rect = svg.getBoundingClientRect();
      x = (rect.width/2 - pan.x)/scale; y = (rect.height/2 - pan.y)/scale;
      while(!isPositionFree(x,y)) { x+=20; y+=20; }
    }
    const node: MindNode = {
      id: newId, label: "", x, y, w: BASE_W, h: BASE_H, strokeColor: "#333", bold: false,
    };
    setNodes((ns) => [...ns, node]);
    setTimeout(() => bringBoxIntoView(x, y, BASE_W, BASE_H), 0);
    return newId;
  }
  function addChild(parentId: number): number {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return parentId;
    pushHistory();
    const newId = nodes.length ? Math.max(...nodes.map((n) => n.id)) + 1 : 1;
    let angle = getChildrenOf(parentId).length * GOLDEN_ANGLE;
    let radius = CHILD_RADIUS;
    let x = parent.x, y = parent.y;
    for (let i = 0; i < 96; i++) {
      x = parent.x + Math.cos(angle) * radius;
      y = parent.y + Math.sin(angle) * radius;
      if (isPositionFree(x, y, parentId)) break;
      angle += GOLDEN_ANGLE;
      if (i % 8 === 7) radius += 24;
    }
    const child: MindNode = {
      id: newId, label: "", x, y, w: BASE_W, h: BASE_H, strokeColor: parent.strokeColor, fillColor: parent.fillColor, bold: false,
    };
    setNodes((ns) => [...ns, child]);
    // Standardmäßig normale Linie (kein Pfeil), wie gewünscht
    setEdges((es) => [...es, { id: Date.now(), source: parentId, target: newId, arrow: false }]); 
    setTimeout(() => bringBoxIntoView(x, y, BASE_W, BASE_H), 0);
    return newId;
  }
  function addSiblingOf(nodeId: number): number {
    const parentId = getParentId(nodeId);
    if (parentId != null) return addChild(parentId);
    return addStandalone();
  }

  function removeEdges(ids: number[]) {
    if (!ids.length) return;
    pushHistory();
    const del = new Set(ids);
    setEdges((prev) => prev.filter((e) => !del.has(e.id)));
    setSelectedEdgeIds(new Set());
  }
  function removeNodes(ids: number[]) {
    if (!ids.length) return;
    pushHistory();
    const del = new Set(ids);
    setNodes((prev) => prev.filter((n) => !del.has(n.id)));
    setEdges((prev) => prev.filter((e) => !del.has(e.source) && !del.has(e.target)));
    clearSelection();
  }

  /** --- Interaction --- */
  function onPointerDownNode(e: React.PointerEvent<SVGGElement>, id: number) {
    if (editingId !== null) return;

    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      
      if (selectedId != null && selectedId !== id) {
         const existingEdge = edges.find(ed => 
            (ed.source === selectedId && ed.target === id) || 
            (ed.source === id && ed.target === selectedId)
         );

         if (existingEdge) {
             pushHistory();
             removeEdges([existingEdge.id]);
         } else {
             pushHistory();
             // Shift+Klick erstellt normale Linie (false)
             ensureEdge(selectedId, id, false);
         }
         selectOnly(id);
         return;
      }
      
      selectOnly(id);
      const src = nodes.find((n) => n.id === id)!;
      setLinking({ phase: "pending", sourceId: id, x: src.x, y: src.y, startX: src.x, startY: src.y });
      return;
    }

    if (linking.phase !== "idle") return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        const idsArr = Array.from(next);
        setSelectedId(idsArr[0] ?? null);
        setSelectedEdgeIds(new Set());
        freshTyping.current = true;
        return next;
      });
      return;
    }

    const wasInSelection = selectedIds.has(id);
    freshTyping.current = true;
    if (!wasInSelection) selectOnly(id);

    const { x: px, y: py } = toWorld(e.clientX, e.clientY);
    if (selectedIds.size > 1) {
      groupDragging.current = true;
      groupStart.current = { x: px, y: py };
      groupStartPositions.current = Array.from(selectedIds).map((nid) => {
        const n = nodes.find((nn) => nn.id === nid)!;
        return { id: nid, x: n.x, y: n.y };
      });
    } else {
      draggingNodeId.current = id;
      const node = nodes.find((n) => n.id === id)!;
      dragOffset.current = { dx: node.x - px, dy: node.y - py };
      somethingMoved.current = false;
    }
  }

  function onPointerDownSvg(e: React.PointerEvent<SVGSVGElement>) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.current.size === 2) {
      const pts = Array.from(activeTouches.current.values());
      const { cx, cy, d } = getCentroidAndDistance(pts);
      pinchStart.current = { d, scale, panX: pan.x, panY: pan.y, cx, cy };
    }
    panning.current = activeTouches.current.size < 2;
    panStart.current = { x: e.clientX, y: e.clientY };
    panAtStart.current = { ...pan };
  }

  function onPointerMoveSvg(e: React.PointerEvent<SVGSVGElement>) {
    if (activeTouches.current.has(e.pointerId)) {
      activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (marquee.active) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      setMarquee((m) => ({ ...m, x2: x, y2: y }));
      return;
    }
    if (linking.phase === "pending" || linking.phase === "active") {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const thresholdWorld = DRAG_THRESHOLD / scale;
      const moved = Math.hypot(x - linking.startX, y - linking.startY) > thresholdWorld;
      if (linking.phase === "pending" && moved) setLinking((l) => ({ ...l, phase: "active", x, y }));
      else if (linking.phase === "active") setLinking((l) => ({ ...l, x, y }));
      return;
    }
    if (groupDragging.current) {
      somethingMoved.current = true;
      const { x: px, y: py } = toWorld(e.clientX, e.clientY);
      const dx = px - groupStart.current.x;
      const dy = py - groupStart.current.y;
      const posMap = new Map(groupStartPositions.current.map((p) => [p.id, p]));
      setNodes((prev) => prev.map((n) => selectedIds.has(n.id) ? { ...n, x: posMap.get(n.id)!.x + dx, y: posMap.get(n.id)!.y + dy } : n));
      return;
    }
    if (draggingNodeId.current != null) {
      const { x: px, y: py } = toWorld(e.clientX, e.clientY);
      const id = draggingNodeId.current;
      setNodes((prev) => prev.map((n) => n.id === id ? { ...n, x: px + dragOffset.current.dx, y: py + dragOffset.current.dy } : n));
      somethingMoved.current = true;
      return;
    }
    if (panning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panAtStart.current.x + dx, y: panAtStart.current.y + dy });
    }
  }

  function onPointerUpSvg(e?: React.PointerEvent<SVGSVGElement>) {
    if (e) activeTouches.current.delete(e.pointerId);
    if (marquee.active) {
      const { x1, y1, x2, y2 } = marquee;
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      const ids = nodes.filter((n) => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY).map((n) => n.id);
      selectFromArray(ids);
      setMarquee({ active: false, x1: 0, y1: 0, x2: 0, y2: 0 });
    }
    if ((linking.phase === "pending" || linking.phase === "active") && linking.sourceId != null) {
      const targetId = findNodeAt(linking.x, linking.y, linking.sourceId);
      if (targetId) {
        const exists = edges.some((ed) => (ed.source === linking.sourceId && ed.target === targetId) || (ed.source === targetId && ed.target === linking.sourceId));
        if (!exists) {
          pushHistory();
          // Wenn man zieht (drag), dann ist es ein Pfeil (true).
          const isDrag = linking.phase === "active";
          setEdges((es) => [...es, { id: Date.now(), source: linking.sourceId!, target: targetId, arrow: isDrag }]);
        }
        selectOnly(targetId);
      }
      setLinking({ phase: "idle", sourceId: null, x: 0, y: 0, startX: 0, startY: 0 });
    }
    if (somethingMoved.current) pushHistory();
    draggingNodeId.current = null;
    groupDragging.current = false;
    panning.current = false;
    somethingMoved.current = false;
  }
  function onPointerCancelSvg(e: React.PointerEvent<SVGSVGElement>) {
    activeTouches.current.delete(e.pointerId);
    pinchStart.current = null; panning.current = false;
  }

  /** --- Keyboard (All Features) --- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingId != null) return;
      const hasNodeSel = selectedIds.size > 0;
      const hasEdgeSel = selectedEdgeIds.size > 0;

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && (e.key === "Z" || e.key === "z")))) { e.preventDefault(); redo(); return; }

      // Highlight (Strg+B) - Multi Selection
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
          e.preventDefault();
          const ids = Array.from(selectedIds);
          if (ids.length > 0) {
             pushHistory();
             setNodes(prev => prev.map(n => ids.includes(n.id) ? { ...n, bold: !n.bold } : n));
          }
          return;
      }

      // Copy (Strg+C)
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
          e.preventDefault();
          if (selectedIds.size > 0) {
              const nodesToCopy = nodes.filter(n => selectedIds.has(n.id));
              const edgesToCopy = edges.filter(ed => selectedIds.has(ed.source) && selectedIds.has(ed.target));
              setClipboard({ nodes: nodesToCopy, edges: edgesToCopy });
          }
          return;
      }

      // Paste (Strg+V)
      if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
          e.preventDefault();
          if (!clipboard) return;
          pushHistory();
          const idMap = new Map<number, number>();
          const maxId = nodes.length ? Math.max(...nodes.map(n => n.id)) : 0;
          let currentMax = maxId;
          const pasteOffset = 20;

          const newNodes = clipboard.nodes.map(n => {
              currentMax++;
              const newId = currentMax;
              idMap.set(n.id, newId);
              return { ...n, id: newId, x: n.x + pasteOffset, y: n.y + pasteOffset };
          });
          const newEdges = clipboard.edges.map(ed => ({
              ...ed,
              id: Date.now() + Math.random(),
              source: idMap.get(ed.source)!,
              target: idMap.get(ed.target)!
          }));
          setNodes(prev => [...prev, ...newNodes]);
          setEdges(prev => [...prev, ...newEdges]);
          selectFromArray(newNodes.map(n => n.id));
          return;
      }

      // Pfeiltasten (Navigation)
      if ((e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") && selectedId != null) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" ? { x: 0, y: -1 } : e.key === "ArrowDown" ? { x: 0, y: 1 } : e.key === "ArrowLeft" ? { x: -1, y: 0 } : { x: 1, y: 0 };
        const cur = nodes.find((n) => n.id === selectedId);
        if (!cur) return;
        const len = Math.hypot(dir.x, dir.y) || 1;
        const ux = dir.x / len; const uy = dir.y / len;
        type Cand = { id: number; dist: number; angle: number; };
        const candidates: Cand[] = [];
        for (const n of nodes) {
          if (n.id === selectedId) continue;
          const vx = n.x - cur.x; const vy = n.y - cur.y;
          const dist = Math.hypot(vx, vy);
          if (dist === 0) continue;
          const dot = vx * ux + vy * uy;
          if (dot <= 0) continue;
          const cos = dot / dist;
          const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
          candidates.push({ id: n.id, dist, angle });
        }
        if (!candidates.length) return;
        const DEG = Math.PI / 180;
        function pickWithin(maxAngleRad: number): Cand | null {
          let best: Cand | null = null;
          for (const c of candidates) {
            if (c.angle > maxAngleRad) continue;
            if (!best) { best = c; continue; }
            if (c.dist < best.dist - 1e-3 || (Math.abs(c.dist - best.dist) <= 1e-3 && c.angle < best.angle)) { best = c; }
          }
          return best;
        }
        let best = pickWithin(30 * DEG);
        if (!best) best = pickWithin(60 * DEG);
        if (!best) best = candidates.reduce((acc, c) => (c.angle < acc.angle ? c : acc));
        if (best) {
            selectOnly(best.id);
            const n = nodes.find((x) => x.id === best!.id);
            if (n) bringBoxIntoView(n.x, n.y, n.w, n.h);
        }
        return;
      }

      // Tab / Shift+Tab (Hierarchie)
      if (e.key === "Tab" && e.shiftKey && selectedId != null && selectedIds.size === 1) {
         e.preventDefault();
         if (!shiftTabPathRef.current || shiftTabPathRef.current.indexOf(selectedId) === -1) {
             const path = buildRootPath(selectedId);
             shiftTabPathRef.current = path;
             shiftTabIndexRef.current = path.length - 1;
         }
         const path = shiftTabPathRef.current!;
         let idx = shiftTabIndexRef.current;
         if (idx > 0) idx = idx - 1; else { if (idx < path.length - 1) idx = idx + 1; else return; }
         shiftTabIndexRef.current = idx;
         const nextId = path[idx];
         selectOnly(nextId);
         const n = nodes.find((x) => x.id === nextId);
         if (n) bringBoxIntoView(n.x, n.y, n.w, n.h);
         return;
      }
      if (e.key === "Tab" && !e.shiftKey && selectedId != null && selectedIds.size === 1) {
         e.preventDefault();
         const prevId = prevSelectedIdRef.current;
         if (prevId == null || prevId === selectedId) return;
         if (!nodes.some((n) => n.id === prevId)) return;
         selectOnly(prevId);
         const n = nodes.find((x) => x.id === prevId);
         if (n) bringBoxIntoView(n.x, n.y, n.w, n.h);
         return;
      }

      // Delete & Backspace
      if (e.key === "Delete") {
          if(hasNodeSel) removeNodes(Array.from(selectedIds));
          else if(hasEdgeSel) removeEdges(Array.from(selectedEdgeIds));
          return;
      }
      if (e.key === "Backspace") {
         if (hasEdgeSel && !hasNodeSel) {
             e.preventDefault(); pushHistory();
             setEdges(prev => prev.map(ed => {
                 if (!selectedEdgeIds.has(ed.id)) return ed;
                 const txt = ed.label || "";
                 return { ...ed, label: txt.slice(0, Math.max(0, txt.length - 1)) };
             }));
             return;
         }
         const ids = Array.from(selectedIds);
         if (ids.length > 1) { removeNodes(ids); return; }
         if (ids.length === 1) {
             e.preventDefault(); pushHistory();
             setNodes(prev => prev.map(n => {
                 if(n.id!==ids[0]) return n;
                 const next = n.label.slice(0, Math.max(0, n.label.length-1));
                 return resizeNodeForLabel({...n, label:next});
             }));
             return;
         }
      }

      // Typing
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const char = e.key;
          if (hasEdgeSel) {
             pushHistory(); const replaceAll = freshTyping.current;
             setEdges(prev => prev.map(ed => {
                 if (!selectedEdgeIds.has(ed.id)) return ed;
                 const cur = ed.label ?? "";
                 return { ...ed, label: replaceAll ? char : cur + char };
             }));
             freshTyping.current = false; return;
          }
          if (hasNodeSel) {
             pushHistory(); const replaceAll = freshTyping.current; const ids = Array.from(selectedIds);
             setNodes(prev => prev.map(n => {
                 if(!ids.includes(n.id)) return n;
                 return resizeNodeForLabel({...n, label: replaceAll ? char : n.label + char});
             }));
             freshTyping.current = false; return;
          }
      }

      // Enter / Shift+Enter
      if (e.key === "Enter" && !e.shiftKey && selectedId != null && selectedIds.size === 1) {
          e.preventDefault(); selectOnly(addChild(selectedId)); freshTyping.current = true; return;
      }
      if (e.key === "Enter" && e.shiftKey && selectedId != null && selectedIds.size === 1) {
          e.preventDefault(); selectOnly(addSiblingOf(selectedId)); freshTyping.current = true; return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedIds, selectedEdgeIds, editingId, clipboard]);

  function onPointerDownBg(e: React.PointerEvent<SVGRectElement>) {
      if (editingId != null) setEditingId(null);
      if (linking.phase !== "idle") return;
      if (e.shiftKey) {
          e.preventDefault(); const { x, y } = toWorld(e.clientX, e.clientY);
          setMarquee({ active: true, x1: x, y1: y, x2: x, y2: y }); return;
      }
      clearSelection(); panning.current = true; panStart.current = { x: e.clientX, y: e.clientY }; panAtStart.current = { ...pan }; freshTyping.current = true;
  }
  function onWheelSvg(e: React.WheelEvent<SVGSVGElement>) {
      e.preventDefault(); const doZoom = !e.shiftKey;
      if (doZoom) {
          const zoomIntensity = 0.0015; const factor = Math.exp(-e.deltaY * zoomIntensity); const newScale = clamp(scale * factor, 0.3, 3);
          const svg = svgRef.current!; const rect = svg.getBoundingClientRect();
          const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
          const wx = (mx - pan.x) / scale; const wy = (my - pan.y) / scale;
          setPan({ x: mx - wx * newScale, y: my - wy * newScale }); setScale(newScale); return;
      }
      setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
  }

  return (
    <div
      style={{
        width: "100vw", height: "100vh", background: "#f5f5f5", overflow: "hidden", userSelect: "none",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
      }}
      onClick={() => { if (contextMenu.open) setContextMenu({ ...contextMenu, open: false }); }}
      onContextMenu={(e) => {
        e.preventDefault(); const w = toWorld(e.clientX, e.clientY);
        setContextMenu({ open: true, x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, kind: "bg" });
      }}
    >
      {/* Hilfe Icon */}
      <div 
        style={{position:'fixed', top: 10, right: 10, zIndex: 1000}}
        onMouseEnter={() => setShowHelp(true)}
        onMouseLeave={() => setShowHelp(false)}
      >
          <div style={{width: 32, height: 32, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', color: '#555', cursor:'help', border:'1px solid #ddd'}}>?</div>
          {showHelp && (
              <div style={{position:'absolute', top: 40, right: 0, width: 220, background:'white', padding: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 12, lineHeight: 1.6, border: '1px solid #eee'}}>
                  <strong>Shortcuts</strong><br/>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 4}}>
                  <span>Enter</span> <span>Add Child</span>
                      <span>Shift+Enter</span> <span>Add Sibling</span>
                      <span>Shift+Drag</span> <span>Connect (Arrow)</span>
                      <span>Shift+Click</span> <span>Connect (Line)</span>
                      <span>Ctrl+B</span> <span>Highlight</span>
                      <span>Ctrl+C/V</span> <span>Copy / Paste</span>
                      <span>Arrow Keys</span> <span>Navigate</span>
                      <span>Tab</span> <span>Switch Node</span>
                  </div>
              </div>
          )}
      </div>

      {/* Toolbar */}
      <div style={{ position: "fixed", top: 5, left: 5, zIndex: 1500, display: "flex", gap: 10, background: "rgba(255,255,255,0.9)", padding: "5px 5px", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,.12)", border: "1px solid rgba(0,0,0,.06)" }}>
        <button onClick={exportToFile} style={{ border: "none", background: "transparent", cursor: "pointer" }}>💾</button>
        <button onClick={() => fileInputRef.current?.click()} style={{ border: "none", background: "transparent", cursor: "pointer" }}>📂</button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleFileChange} />
      </div>

      <svg
        ref={svgRef} width="100%" height="100%"
        onPointerDown={onPointerDownSvg} onPointerMove={onPointerMoveSvg} onPointerUp={onPointerUpSvg} onPointerLeave={onPointerUpSvg} onPointerCancel={onPointerCancelSvg} onWheel={onWheelSvg}
        style={{ touchAction: "none", background: "#ffffff", cursor: groupDragging.current || draggingNodeId.current ? "grabbing" : linking.phase === "active" ? "crosshair" : "grab" }}
      >
        <defs>
          <pattern id="dotGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              {/* Das hier ist rund: */}
              <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.7" />
            </pattern>
          {/* RefX auf 10 für exakte Spitze */}
          <marker id="arrow-default" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
               <polygon points="0 0, 10 3.5, 0 7" fill="#888" />
          </marker>
          <marker id="arrow-selected" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
               <polygon points="0 0, 10 3.5, 0 7" fill="#1976d2" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#dotGrid)" onPointerDown={onPointerDownBg} onContextMenu={(e) => { e.preventDefault(); const w = toWorld(e.clientX, e.clientY); setContextMenu({ open: true, x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, kind: "bg" }); }} />

          {edges.map((e) => {
            const s = nodes.find((n) => n.id === e.source);
            const t = nodes.find((n) => n.id === e.target);
            if (!s || !t) return null;
            
            // Intersection Math für saubere Pfeile
            const { x: tx, y: ty } = getRectIntersection(s, t);

            const highlightedNodeSide = selectedIds.has(e.source) || selectedIds.has(e.target);
            const isEdgeSelected = selectedEdgeIds.has(e.id);
            const stroke = isEdgeSelected ? "#1976d2" : highlightedNodeSide ? "#1976d2" : "#888";
            const strokeWidth = isEdgeSelected ? 3 : highlightedNodeSide ? 2.5 : 1.5;
            const dash = e.dashed ? "8 6" : undefined;
            const marker = e.arrow ? (isEdgeSelected ? "url(#arrow-selected)" : "url(#arrow-default)") : undefined;

            const onEdgePointerDown = (evt: any) => {
               evt.stopPropagation(); setSelectedIds(new Set()); setSelectedId(null);
               setSelectedEdgeIds((prev) => { const next = new Set(prev); if (evt.shiftKey) { if (next.has(e.id)) next.delete(e.id); else next.add(e.id); } else { next.clear(); next.add(e.id); } return next; }); freshTyping.current = true;
            };

            const mx = (s.x + tx) / 2;
            const my = (s.y + ty) / 2;

            return (
              <g key={e.id}>
                <line x1={s.x} y1={s.y} x2={tx} y2={ty} stroke="transparent" strokeWidth={Math.max(12 / scale, 6)} onPointerDown={onEdgePointerDown} onContextMenu={(evt) => { evt.preventDefault(); evt.stopPropagation(); setSelectedIds(new Set()); setSelectedId(null); setSelectedEdgeIds(new Set([e.id])); setContextMenu({ open: true, x: evt.clientX, y: evt.clientY, kind: "edge", targetEdgeId: e.id }); }} />
                <line x1={s.x} y1={s.y} x2={tx} y2={ty} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} vectorEffect="non-scaling-stroke" markerEnd={marker} />
                {e.label && (
                  <g pointerEvents="none">
                    <rect x={mx - e.label.length * 6} y={my - 10} width={Math.max(24, e.label.length * 12)} height={20} rx={6} ry={6} fill="rgba(255,255,255,0.95)" stroke="rgba(15,23,42,0.08)" strokeWidth={0.5} />
                    <text x={mx} y={my + 5} textAnchor="middle" fontSize={12} fill={isEdgeSelected ? "#1976d2" : "#0f172a"}>{e.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {linking.phase === "active" && linking.sourceId != null && (() => {
            const s = nodes.find((n) => n.id === linking.sourceId)!;
            return <line x1={s.x} y1={s.y} x2={linking.x} y2={linking.y} stroke="#1976d2" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" markerEnd="url(#arrow-selected)" />;
          })()}

          {nodes.map((n) => {
            const isEditing = editingId === n.id;
            const isSelected = selectedIds.has(n.id);
            const baseFont = clamp(Math.round(n.h * 0.35), 12, 20);
            const displayText = isEditing ? editingText : n.label;
            const L = layoutLabel(displayText, baseFont, n.w);
            const corner = Math.round(Math.min(n.w, n.h) * 0.24);
            const stroke = isSelected ? "#1976d2" : n.strokeColor || "#0f172a";
            // Highlight: Dickerer Rand (4)
            const strokeW = n.bold ? 4 : (isSelected ? 2.5 : 1.5);

            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} onPointerDown={(e) => onPointerDownNode(e, n.id)} onDoubleClick={() => { selectOnly(n.id); freshTyping.current = true; }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!selectedIds.has(n.id)) selectOnly(n.id); setContextMenu({ open: true, x: e.clientX, y: e.clientY, kind: "node", targetNodeId: n.id }); }}>
                <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={corner} ry={corner} fill={n.fillColor || "#ffffff"} />
                <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={corner} ry={corner} fill="none" stroke={stroke} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
                <g pointerEvents="none">
                  {L.lines.map((line, i) => (
                    <text key={i} textAnchor="middle" dominantBaseline="middle" x={0} y={-((L.lines.length - 1) / 2) * L.lineHeight + i * L.lineHeight} fontSize={L.fontSize} fontWeight={n.bold ? 700 : 500} fill={isSelected ? "#0f172a" : "#111827"}>{line}</text>
                  ))}
                </g>
                {isEditing && (
                  <foreignObject x={-n.w / 2 + 8} y={-n.h / 2 + 6} width={n.w - 16} height={n.h - 12}>
                    <input ref={editInputRef} value={editingText} onChange={(e) => { const v = e.target.value; setEditingText(v); if (editingId != null) { pushHistory(); setNodes((prev) => prev.map((nn) => nn.id === editingId ? resizeNodeForLabel({ ...nn, label: v }) : nn)); } }} onBlur={() => setEditingId(null)} onKeyDown={(e) => { if (e.key === "Enter") setEditingId(null); if (e.key === "Escape") setEditingId(null); }} style={{ width: "100%", height: "100%", border: "none", background: "transparent", color: "transparent", caretColor: "#000", fontSize: L.fontSize, lineHeight: `${L.lineHeight}px`, textAlign: "center", outline: "none" }} />
                  </foreignObject>
                )}
              </g>
            );
          })}
          {marquee.active && <rect x={Math.min(marquee.x1, marquee.x2)} y={Math.min(marquee.y1, marquee.y2)} width={Math.abs(marquee.x2 - marquee.x1)} height={Math.abs(marquee.y2 - marquee.y1)} fill="#93c5fd" fillOpacity={0.18} stroke="#2563eb" strokeDasharray="6 4" />}
        </g>
      </svg>

      {contextMenu.open && (
        <div style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 2000, background: "#ffffff", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,.18)", padding: 6, minWidth: 240, border: "1px solid rgba(15,23,42,.06)" }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.kind === "bg" && <MenuItem label="➕ New Node" onClick={() => { const id = contextMenu.wx != null ? addStandalone({ x: contextMenu.wx, y: contextMenu.wy! }) : addStandalone(); selectOnly(id); setContextMenu({ ...contextMenu, open: false }); }} />}
          
          {contextMenu.kind === "node" && (
            <>
              <MenuItem label="✏️ Rename" onClick={() => { if (contextMenu.targetNodeId != null) { setEditingId(contextMenu.targetNodeId); setEditingText(nodes.find((n) => n.id === contextMenu.targetNodeId)?.label || ""); } setContextMenu({ ...contextMenu, open: false }); }} />
              <MenuItem label="➕ Child" onClick={() => { if (contextMenu.targetNodeId != null) selectOnly(addChild(contextMenu.targetNodeId)); setContextMenu({ ...contextMenu, open: false }); }} />
              <MenuItem label="⭐ Highlight (Strg+B)" onClick={() => { 
                  if (contextMenu.targetNodeId != null) { 
                      pushHistory(); 
                      const ids = Array.from(selectedIds);
                      setNodes(prev => prev.map(n => ids.includes(n.id) ? { ...n, bold: !n.bold } : n));
                  } 
                  setContextMenu({ ...contextMenu, open: false }); 
              }} />
              <div style={{ height: 1, background: "rgba(15,23,42,.08)", margin: "6px 0" }} />
              <MenuItem label="🗑️ Delete" onClick={() => { if (contextMenu.targetNodeId != null) removeNodes([contextMenu.targetNodeId]); setContextMenu({ ...contextMenu, open: false }); }} />
            </>
          )}

          {contextMenu.kind === "edge" && (
            <>
              <MenuItem label="╌╌╌ Toggle dashed" onClick={() => { if (contextMenu.targetEdgeId != null) { pushHistory(); setEdges((prev) => prev.map((ed) => ed.id === contextMenu.targetEdgeId ? { ...ed, dashed: !ed.dashed } : ed)); } setContextMenu({ ...contextMenu, open: false }); }} />
              <MenuItem label="➔ Toggle Arrow" onClick={() => { if (contextMenu.targetEdgeId != null) { pushHistory(); setEdges((prev) => prev.map((ed) => ed.id === contextMenu.targetEdgeId ? { ...ed, arrow: !ed.arrow } : ed)); } setContextMenu({ ...contextMenu, open: false }); }} />
              <MenuItem label="✏️ Rename edge" onClick={() => { if (contextMenu.targetEdgeId != null) { const ed = edges.find((x) => x.id === contextMenu.targetEdgeId); const next = window.prompt("Label for edge:", ed?.label ?? ""); if (next !== null) { pushHistory(); setEdges((prev) => prev.map((e) => e.id === contextMenu.targetEdgeId ? { ...e, label: next.trim() || undefined } : e)); } } setContextMenu({ ...contextMenu, open: false }); }} />
              <div style={{ height: 1, background: "rgba(15,23,42,.08)", margin: "6px 0" }} />
              <MenuItem label="🗑️ Delete edge" onClick={() => { if (contextMenu.targetEdgeId != null) removeEdges([contextMenu.targetEdgeId]); setContextMenu({ ...contextMenu, open: false }); }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "transparent", cursor: disabled ? "not-allowed" : "pointer", borderRadius: 8, color: disabled ? "#9ca3af" : "#0f172a", fontSize: 13 }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,.08)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>{label}</button>
  );
}
