import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../studio/Icon";

type Option = { value: string; label: string };
/** A themed select with keyboard navigation; the popup escapes the scrolling drawer. */
export default function SelectControl({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [index, setIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, top: 0, width: 200, maxHeight: 240 });
  const typed = useRef({ text: "", at: 0 });
  const selected = options.findIndex((o) => o.value === value);
  const close = (restore = true) => { setOpen(false); if (restore) trigger.current?.focus(); };
  const choose = (i: number) => { onChange(options[i].value); close(); };
  const show = () => {
    const r = trigger.current!.getBoundingClientRect(), below = window.innerHeight - r.bottom - 14;
    const above = below < Math.min(240, options.length * 38 + 12) && r.top > below;
    const width = Math.min(r.width, window.innerWidth - 24);
    setPosition({ left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), width,
      ...(above ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      maxHeight: Math.max(60, Math.min(240, above ? r.top - 14 : below)) });
    setIndex(Math.max(0, selected)); setOpen(true);
  };
  useEffect(() => {
    if (open) popup.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
  }, [open, index]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) setOpen(false);
    };
    const moved = (e: Event) => { if (!popup.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("scroll", moved, true); window.removeEventListener("resize", moved); };
  }, [open]);
  return <div className="world-select">
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined}
      onClick={() => open ? close() : show()}
      onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) { e.preventDefault(); show(); } }}>
      <span>{options[selected]?.label || "Choose"}</span><Icon name="down" size={14} />
    </button>
    {open && createPortal(<div ref={popup} id={id} role="listbox" aria-label={label} className="world-select-popup" style={position}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        else if (e.key === "Tab") close();
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length); }
        else if (e.key === "Home" || e.key === "End") { e.preventDefault(); setIndex(e.key === "Home" ? 0 : options.length - 1); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(index); }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); const now = e.timeStamp; typed.current = { text: (now - typed.current.at < 650 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
          const match = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
          if (match >= 0) setIndex(match);
        }
      }}>
      {options.map((o, i) => <button type="button" role="option" aria-selected={o.value === value} key={o.value} data-index={i} tabIndex={index === i ? 0 : -1}
        onFocus={() => setIndex(i)} onClick={() => choose(i)}><span>{o.label}</span>{o.value === value && <Icon name="check" size={14} />}</button>)}
    </div>, document.body)}
  </div>;
}
