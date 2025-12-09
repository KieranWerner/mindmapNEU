import type { MindNode } from "../types";
import { BASE_W, BASE_H } from "../constants";
import { approxTextWidth } from "./math";

export function layoutLabel(label: string, baseFont: number, minW: number) {
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
    lines,
    width,
    height,
    lineHeight,
    paddingX,
    paddingY,
    fontSize: baseFont,
  };
}

export function resizeNodeForLabel(node: MindNode): MindNode {
  const baseFont = Math.round(Math.max(12, Math.min(20, node.h * 0.35)));
  const L = layoutLabel(node.label, baseFont, node.w);
  return { ...node, w: L.width, h: L.height };
}
