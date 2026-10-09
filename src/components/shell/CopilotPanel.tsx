"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Database, Send, Sparkles } from "lucide-react";
import { Drawer } from "@/components/ui/overlay";
import { Button, cx } from "@/components/ui/primitives";
import { useDemo } from "@/lib/demo/store";
import { askCopilot, SUGGESTED_QUESTIONS, type CopilotAnswer } from "@/lib/demo/copilot";

interface Turn {
  id: number;
  q: string;
  a: CopilotAnswer | null;
}

export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ds, persona } = useDemo();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    const id = ++seq.current;
    setTurns((t) => [...t, { id, q: question, a: null }]);
    setInput("");
    // Short composition delay keeps the interaction readable on a projector.
    window.setTimeout(() => setTurns((t) => t.map((x) => (x.id === id ? { ...x, a: askCopilot(ds, question) } : x))), 450);
  };

  // Engineering suggestions reference only a record in the engineer's own scope.
  const myTop = persona === "engineering" ? [...ds.recommendations].sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings)[0] : undefined;
  const suggestions =
    persona === "engineering"
      ? ["What decisions need my attention?", ...(myTop ? [`Summarize ${myTop.id}`] : []), "Who owns the open savings?", "Are there any spend anomalies?"]
      : SUGGESTED_QUESTIONS;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-accent-500 text-white">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          FinOps Copilot
        </span>
      }
      subtitle="Ask about spend, budgets, savings and accountability. Answers are computed from the demo dataset and link to the underlying records."
      footer={
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <label htmlFor="copilot-input" className="sr-only">
            Ask the copilot
          </label>
          <input id="copilot-input" data-autofocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Where can we save the most?" className="input h-10 flex-1" autoComplete="off" />
          <Button type="submit" variant="primary" size="lg" className="h-10" icon={<Send className="h-4 w-4" aria-hidden />} disabled={!input.trim()}>
            Ask
          </Button>
        </form>
      }
    >
      {turns.length === 0 && (
        <div>
          <p className="text-sm text-slate-600">Suggested questions</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-left text-[13px] text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-5" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3.5 py-2 text-sm text-white">{t.q}</div>
            </div>
            {!t.a ? (
              <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Composing answer">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-slate-400" style={{ animationDelay: `${i * 160}ms` }} />
                ))}
              </div>
            ) : (
              <div className="animate-fade-up rounded-2xl rounded-bl-md border border-line bg-white p-4 shadow-card">
                <div className="text-[13.5px] font-semibold text-slate-900">{t.a.title}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{t.a.summary}</p>
                {t.a.bullets.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {t.a.bullets.map((b) => (
                      <li key={b} className="flex gap-2 text-[13px] leading-snug text-slate-600">
                        <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {t.a.links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.a.links.map((l) => (
                      <Link key={l.href} href={l.href} onClick={onClose} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
                        {l.label}
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ))}
                  </div>
                )}
                <div className={cx("mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-400")}>
                  <Database className="h-3 w-3" aria-hidden />
                  Based on: {t.a.basis}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Drawer>
  );
}
