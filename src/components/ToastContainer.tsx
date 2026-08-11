import { useToastStore } from "@/lib/toast";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div style={{ position: "absolute", right: 18, bottom: 42, zIndex: 130, display: "flex", flexDirection: "column", gap: 9, alignItems: "flex-end" }}>
      {toasts.map((t) => {
        const icon = {
          success: <CheckCircle2 size={15} className="text-em" />,
          error: <AlertCircle size={15} style={{ color: "#e8556e" }} />,
          warning: <AlertTriangle size={15} style={{ color: "#e0a50d" }} />,
          info: <Info size={15} style={{ color: "#2b9be0" }} />,
        }[t.type];

        const cls = {
          success: "",
          error: "err",
          warning: "warn",
          info: "info",
        }[t.type];

        return (
          <div key={t.id} className={cn("toast", cls)}>
            {icon}
            <span>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              style={{ background: "none", border: 0, color: "var(--fnt)", cursor: "pointer", padding: 0, marginLeft: 4 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
