import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Option { value: string; label: string; detail?: string }

export default function ModelPicker({ label, value, options, onChange, compact = false }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const selected = options.find((option) => option.value === value) || options[0];
  return <div className={`picker ${compact ? "picker-compact" : ""}`} ref={root}>
    <button type="button" className="picker-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{selected?.label || label}</span><ChevronDown size={13} />
    </button>
    {open && <div className="picker-options" role="listbox" aria-label={label}>
      {options.map((option) => <button type="button" role="option" aria-selected={value === option.value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
        <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>{value === option.value && <Check size={14} />}
      </button>)}
    </div>}
  </div>;
}
