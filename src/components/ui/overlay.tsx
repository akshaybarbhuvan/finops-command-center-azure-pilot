"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cx } from "./primitives";

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute("data-skip-focus"));
    const first = focusables()[0];
    (node?.querySelector<HTMLElement>("[data-autofocus]") ?? first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const els = focusables();
        if (!els.length) return;
        const f = els[0];
        const l = els[els.length - 1];
        if (e.shiftKey && document.activeElement === f) {
          e.preventDefault();
          l.focus();
        } else if (!e.shiftKey && document.activeElement === l) {
          e.preventDefault();
          f.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-fade-up" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          tabIndex={-1}
          className={cx("relative w-full animate-scale-in rounded-t-2xl bg-white shadow-pop sm:rounded-2xl", size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl")}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 id="modal-title" className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children && <div className="max-h-[65vh] overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-slate-50/60 px-6 py-3.5 sm:rounded-b-2xl">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "lg" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: "md" | "lg" | "xl" }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 bg-ink-950/35" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          tabIndex={-1}
          className={cx("absolute inset-y-0 right-0 flex w-full animate-slide-in flex-col bg-white shadow-pop", width === "md" ? "sm:max-w-md" : width === "xl" ? "sm:max-w-3xl" : "sm:max-w-xl")}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <h2 id="drawer-title" className="text-base font-semibold leading-snug text-slate-900">
                {title}
              </h2>
              {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close panel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type ToastKind = "success" | "info" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 4800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? TriangleAlert : Info;
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-lift">
              <Icon className={cx("mt-0.5 h-4.5 w-4.5 shrink-0", t.kind === "success" ? "text-emerald-600" : t.kind === "error" ? "text-rose-600" : "text-brand-500")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs text-slate-600">{t.body}</div>}
              </div>
              <button type="button" className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Dismiss notification" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
