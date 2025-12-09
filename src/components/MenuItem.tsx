type MenuItemProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export function MenuItem({ label, onClick, disabled }: MenuItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 12px",
        border: "none",
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 8,
        color: disabled ? "#9ca3af" : "#0f172a",
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(37,99,235,.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}
