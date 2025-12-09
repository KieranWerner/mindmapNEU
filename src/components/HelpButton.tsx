import { useState } from "react";

export function HelpButton() {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div
      style={{ position: "fixed", top: 10, right: 10, zIndex: 1000 }}
      onMouseEnter={() => setShowHelp(true)}
      onMouseLeave={() => setShowHelp(false)}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          color: "#555",
          cursor: "help",
          border: "1px solid #ddd",
        }}
      >
        ?
      </div>
      {showHelp && (
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            width: 220,
            background: "white",
            padding: 12,
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            fontSize: 12,
            lineHeight: 1.6,
            border: "1px solid #eee",
          }}
        >
          <strong>Shortcuts</strong>
          <br />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
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
  );
}
