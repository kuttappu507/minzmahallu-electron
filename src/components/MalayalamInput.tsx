import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { transliterateMalayalam } from "@/lib/malayalamTransliteration";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  transliteration?: boolean;
};

export function MalayalamInput({ value, onChange, transliteration = true, className = "", ...props }: Props) {
  const [enabled, setEnabled] = useState(transliteration);
  const composing = useRef(false);
  const handleChange = (next: string) => {
    if (!enabled || composing.current) { onChange(next); return; }
    onChange(transliterateMalayalam(next));
  };
  return (
    <div className="relative">
      <input
        {...props}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(e) => { composing.current = false; handleChange(e.currentTarget.value); }}
        className={`inp pr-16 ${className}`}
        data-transliteration={enabled ? "ml" : "off"}
      />
      <button
        type="button"
        title={enabled ? "Malayalam transliteration on" : "Malayalam transliteration off"}
        onClick={() => setEnabled(v => !v)}
        className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-semibold transition-colors ${enabled ? "bg-primary text-white" : "bg-surface-hover text-text-tertiary"}`}
        aria-pressed={enabled}
      >
        <Languages size={12} /> ML
      </button>
    </div>
  );
}
