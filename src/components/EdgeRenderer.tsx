import type { Link, MindNode } from "../types";
import { getRectIntersection } from "../utils/math";

type EdgeRendererProps = {
  edges: Link[];
  nodes: MindNode[];
  selectedIds: Set<number>;
  selectedEdgeIds: Set<number>;
  scale: number;
  onSetSelectedIds: (ids: Set<number>) => void;
  onSetSelectedId: (id: number | null) => void;
  onSetSelectedEdgeIds: (updater: (prev: Set<number>) => Set<number>) => void;
  onSetContextMenu: (menu: any) => void;
  freshTypingRef: React.RefObject<boolean>;
};

export function EdgeRenderer({
  edges,
  nodes,
  selectedIds,
  selectedEdgeIds,
  scale,
  onSetSelectedIds,
  onSetSelectedId,
  onSetSelectedEdgeIds,
  onSetContextMenu,
  freshTypingRef,
}: EdgeRendererProps) {
  return (
    <>
      {edges.map((e) => {
        const s = nodes.find((n) => n.id === e.source);
        const t = nodes.find((n) => n.id === e.target);
        if (!s || !t) return null;

        const { x: tx, y: ty } = getRectIntersection(s, t);

        const highlightedNodeSide =
          selectedIds.has(e.source) || selectedIds.has(e.target);
        const isEdgeSelected = selectedEdgeIds.has(e.id);
        const stroke = isEdgeSelected
          ? "#1976d2"
          : highlightedNodeSide
          ? "#1976d2"
          : "#888";
        const strokeWidth = isEdgeSelected ? 3 : highlightedNodeSide ? 2.5 : 1.5;
        const dash = e.dashed ? "8 6" : undefined;
        const marker = e.arrow
          ? isEdgeSelected
            ? "url(#arrow-selected)"
            : "url(#arrow-default)"
          : undefined;

        const onEdgePointerDown = (evt: any) => {
          evt.stopPropagation();
          onSetSelectedIds(new Set());
          onSetSelectedId(null);
          onSetSelectedEdgeIds((prev) => {
            const next = new Set(prev);
            if (evt.shiftKey) {
              if (next.has(e.id)) next.delete(e.id);
              else next.add(e.id);
            } else {
              next.clear();
              next.add(e.id);
            }
            return next;
          });
          if (freshTypingRef.current) freshTypingRef.current = true;
        };

        const mx = (s.x + tx) / 2;
        const my = (s.y + ty) / 2;

        return (
          <g key={e.id}>
            <line
              x1={s.x}
              y1={s.y}
              x2={tx}
              y2={ty}
              stroke="transparent"
              strokeWidth={Math.max(12 / scale, 6)}
              onPointerDown={onEdgePointerDown}
              onContextMenu={(evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                onSetSelectedIds(new Set());
                onSetSelectedId(null);
                onSetSelectedEdgeIds(() => new Set([e.id]));
                onSetContextMenu({
                  open: true,
                  x: evt.clientX,
                  y: evt.clientY,
                  kind: "edge",
                  targetEdgeId: e.id,
                });
              }}
            />
            <line
              x1={s.x}
              y1={s.y}
              x2={tx}
              y2={ty}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
              markerEnd={marker}
            />
            {e.label && (
              <g pointerEvents="none">
                <rect
                  x={mx - e.label.length * 6}
                  y={my - 10}
                  width={Math.max(24, e.label.length * 12)}
                  height={20}
                  rx={6}
                  ry={6}
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(15,23,42,0.08)"
                  strokeWidth={0.5}
                />
                <text
                  x={mx}
                  y={my + 5}
                  textAnchor="middle"
                  fontSize={12}
                  fill={isEdgeSelected ? "#1976d2" : "#0f172a"}
                >
                  {e.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
