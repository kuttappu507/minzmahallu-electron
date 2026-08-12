/*
 * ConfirmDialog — themed replacement for native confirm().
 * Uses Dialog from @/components/ui so it animates with modalIn.
 */
import { AlertTriangle } from "lucide-react";
import { Dialog, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

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
      <div className="dlg-pad">
        <div className={cn("dlg-hero", danger ? "t-rose" : "t-em")}>
          <div className="dlg-hero-ic">
            <AlertTriangle size={18} />
          </div>
          <div className="dlg-hero-body">
            <div className="dlg-hero-title">
              {description}
            </div>
            <div className="dlg-hero-sub">
              This action is permanent — the record will be removed from the database.
            </div>
          </div>
        </div>

        <div className="dlg-actions">
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
