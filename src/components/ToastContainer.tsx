import { useToastStore } from "@/lib/toast";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const icon = {
          success: <CheckCircle2 className="h-5 w-5 text-success" />,
          error: <AlertCircle className="h-5 w-5 text-danger" />,
          warning: <AlertTriangle className="h-5 w-5 text-warning" />,
          info: <Info className="h-5 w-5 text-blue-500" />,
        }[t.type];

        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border min-w-[280px] max-w-md",
              "bg-surface border-border animate-in slide-in-from-right"
            )}
          >
            {icon}
            <p className="flex-1 text-sm text-text-primary">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-text-tertiary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
