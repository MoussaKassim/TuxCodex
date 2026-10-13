import { useEffect, useId, useRef, useState } from "react";
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
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  useEffect(() => { if (open) choices.current[activeIndex]?.focus(); }, [open, activeIndex, options.length]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const selected = options.find((option) => option.value === value) || options[0];
  const openAt = (index: number) => { setActiveIndex(index); setOpen(true); };
  const navigate = (key: string, current: number) => {
    if (!options.length) return false;
    const next = key === "ArrowDown" ? (current + 1) % options.length : key === "ArrowUp" ? (current - 1 + options.length) % options.length : key === "Home" ? 0 : key === "End" ? options.length - 1 : -1;
    if (next < 0) return false;
    openAt(next);
    return true;
  };
  return <div className={`picker ${compact ? "picker-compact" : ""}`} ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="picker-trigger" aria-label={label} aria-haspopup="listbox" aria-controls={listId} aria-expanded={open} onClick={() => open ? setOpen(false) : openAt(selectedIndex)} onKeyDown={(event) => { if (navigate(event.key, selectedIndex)) event.preventDefault(); }}>
      <span>{selected?.label || label}</span><ChevronDown size={13} />
    </button>
    {open && <div id={listId} className="picker-options" role="listbox" aria-label={label} onKeyDown={(event) => { if (navigate(event.key, activeIndex)) event.preventDefault(); }}>
      {options.map((option, index) => <button ref={(element) => { choices.current[index] = element; }} type="button" role="option" aria-selected={value === option.value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}>
        <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>{value === option.value && <Check size={14} />}
      </button>)}
    </div>}
  </div>;
}
