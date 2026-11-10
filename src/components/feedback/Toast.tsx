"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Tone = "success" | "error";
interface ToastItem { id: number; tone: Tone; text: string }
const Ctx = createContext<(tone: Tone, text: string) => void>(() => undefined);

export const useToast = () => useContext(Ctx);

/** Small glass toasts (bottom centre). Announced politely to screen readers; auto-dismiss after 5 s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((s) => s.filter((i) => i.id !== id)), []);
  const push = useCallback((tone: Tone, text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { id, tone, text }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div
              key={i.id} layout role="status"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.3 }}
              className={`glass-card pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${i.tone === "success" ? "text-emerald-800" : "text-red-700"}`}
            >
              {i.tone === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />}
              <span className="flex-1">{i.text}</span>
              <button type="button" onClick={() => dismiss(i.id)} aria-label={t("close")} className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700"><X className="size-4" aria-hidden /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
