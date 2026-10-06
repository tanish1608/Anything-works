import { useEffect, useRef, type ReactNode } from "react";

/** Native modal semantics keep keyboard focus inside and restore it on close. */
export default function WorldDialog({
  label,
  className,
  close,
  children,
}: {
  label: string;
  className: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", ""); // Non-browser DOM test environments.
    return () => {
      if (dialog.close) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {children}
    </dialog>
  );
}
