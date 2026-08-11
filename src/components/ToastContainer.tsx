import { useToastStore } from "@/lib/toast";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const icon = {
            success: <CheckCircle2 className="h-5 w-5 text-success" />,
            error: <AlertCircle className="h-5 w-5 text-danger" />,
            warning: <AlertTriangle className="h-5 w-5 text-warning" />,
            info: <Info className="h-5 w-5 text-info" />,
          }[t.type];

          const accent = {
            success: "border-success/30",
            error: "border-danger/30",
            warning: "border-warning/30",
            info: "border-info/30",
          }[t.type];

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                "flex items-start gap-3 pl-3 pr-4 py-3 rounded-xl shadow-2xl backdrop-blur-xl min-w-[300px] max-w-md pointer-events-auto",
                "glass border",
                accent
              )}
            >
              {icon}
              <p className="flex-1 text-sm text-text-primary leading-relaxed">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
