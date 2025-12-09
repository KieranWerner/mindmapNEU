import type { MindNode } from "../types";
import { clamp } from "../utils/math";
import { layoutLabel } from "../utils/layout";

type NodeRendererProps = {
  nodes: MindNode[];
  editingId: number | null;
  editingText: string;
  selectedIds: Set<number>;
  editInputRef: React.RefObject<HTMLInputElement>;
  onPointerDownNode: (e: React.PointerEvent<SVGGElement>, id: number) => void;
  onSelectOnly: (id: number) => void;
  onSetContextMenu: (menu: any) => void;
  onSetEditingId: (id: number | null) => void;
  onSetEditingText: (text: string) => void;
  onPushHistory: () => void;
  onSetNodes: (updater: (prev: MindNode[]) => MindNode[]) => void;
  onResizeNodeForLabel: (node: MindNode) => MindNode;
  freshTypingRef: React.RefObject<boolean>;
};

export function NodeRenderer({
  nodes,
  editingId,
  editingText,
  selectedIds,
  editInputRef,
  onPointerDownNode,
  onSelectOnly,
  onSetContextMenu,
  onSetEditingId,
  onSetEditingText,
  onPushHistory,
  onSetNodes,
  onResizeNodeForLabel,
  freshTypingRef,
}: NodeRendererProps) {
  return (
    <>
      {nodes.map((n) => {
        const isEditing = editingId === n.id;
        const isSelected = selectedIds.has(n.id);
        const baseFont = clamp(Math.round(n.h * 0.35), 12, 20);
        const displayText = isEditing ? editingText : n.label;
        const L = layoutLabel(displayText, baseFont, n.w);
        const corner = Math.round(Math.min(n.w, n.h) * 0.24);
        const stroke = isSelected ? "#1976d2" : n.strokeColor || "#0f172a";
        const strokeW = n.bold ? 4 : isSelected ? 2.5 : 1.5;

        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            onPointerDown={(e) => onPointerDownNode(e, n.id)}
            onDoubleClick={() => {
              onSelectOnly(n.id);
              if (freshTypingRef.current) freshTypingRef.current = true;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!selectedIds.has(n.id)) onSelectOnly(n.id);
              onSetContextMenu({
                open: true,
                x: e.clientX,
                y: e.clientY,
                kind: "node",
                targetNodeId: n.id,
              });
            }}
          >
            <rect
              x={-n.w / 2}
              y={-n.h / 2}
              width={n.w}
              height={n.h}
              rx={corner}
              ry={corner}
              fill={n.fillColor || "#ffffff"}
            />
            <rect
              x={-n.w / 2}
              y={-n.h / 2}
              width={n.w}
              height={n.h}
              rx={corner}
              ry={corner}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeW}
              vectorEffect="non-scaling-stroke"
            />
            <g pointerEvents="none">
              {L.lines.map((line, i) => (
                <text
                  key={i}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  x={0}
                  y={
                    -((L.lines.length - 1) / 2) * L.lineHeight + i * L.lineHeight
                  }
                  fontSize={L.fontSize}
                  fontWeight={n.bold ? 700 : 500}
                  fill={isSelected ? "#0f172a" : "#111827"}
                >
                  {line}
                </text>
              ))}
            </g>
            {isEditing && (
              <foreignObject
                x={-n.w / 2 + 8}
                y={-n.h / 2 + 6}
                width={n.w - 16}
                height={n.h - 12}
              >
                <input
                  ref={editInputRef}
                  value={editingText}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetEditingText(v);
                    if (editingId != null) {
                      onPushHistory();
                      onSetNodes((prev) =>
                        prev.map((nn) =>
                          nn.id === editingId
                            ? onResizeNodeForLabel({ ...nn, label: v })
                            : nn
                        )
                      );
                    }
                  }}
                  onBlur={() => onSetEditingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSetEditingId(null);
                    if (e.key === "Escape") onSetEditingId(null);
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    background: "transparent",
                    color: "transparent",
                    caretColor: "#000",
                    fontSize: L.fontSize,
                    lineHeight: `${L.lineHeight}px`,
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </foreignObject>
            )}
          </g>
        );
      })}
    </>
  );
}
