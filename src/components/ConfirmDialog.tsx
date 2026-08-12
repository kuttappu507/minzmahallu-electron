/*
 * ConfirmDialog — themed replacement for native confirm().
 * Uses Dialog from @/components/ui so it animates with modalIn.
 */
import { AlertTriangle } from "lucide-react";
import { Dialog, Button } from "@/components/ui";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm Delete",
  description = "Are you sure you want to delete this record? This action cannot be undone.",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div style={{ padding: "2px 0" }}>
        <div
          style={{
            display: "flex",
            gap: 13,
            padding: "12px 14px",
            marginBottom: 14,
            borderRadius: 14,
            background: danger ? "var(--rose-bg)" : "var(--sb)",
            border: `1.5px solid ${danger ? "var(--rose-line)" : "var(--sl)"}`,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              flex: "none",
              display: "grid",
              placeItems: "center",
              background: danger ? "var(--c-rose)" : "var(--sc)",
              color: "#fff",
              boxShadow: danger
                ? "0 2px 0 rgba(171, 39, 64, 0.35)"
                : "0 2px 0 rgba(0,0,0,0.12)",
            }}
          >
            <AlertTriangle size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                font: "700 13.5px Poppins",
                color: danger ? "var(--c-rose)" : "var(--tx)",
                marginBottom: 3,
              }}
            >
              {description}
            </div>
            <div
              style={{
                font: "600 11.5px Poppins",
                color: "var(--mut)",
                lineHeight: 1.4,
              }}
            >
              This action is permanent — the record will be removed from the database.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 9,
            marginTop: 4,
          }}
        >
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={async () => {
              await onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
