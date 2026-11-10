"use client";

import { useId } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { clsx } from "clsx";

const label = "mb-1.5 block text-[0.68rem] font-bold uppercase tracking-wider text-label";

export function Field({ id, text, error, hint, children, className }: { id: string; text: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 flex items-start gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{error}</p>
        : hint ? <p className="mt-1 text-xs text-label">{hint}</p> : null}
    </div>
  );
}

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "id"> {
  id: string; text: string; value: string; onValue: (v: string) => void; error?: string; hint?: string; prefix?: string; suffix?: string; className?: string;
}

/** Glass text/number input with label, optional ৳ prefix or unit suffix and an error line. */
export function TextField({ id, text, value, onValue, error, hint, prefix, suffix, className, ...rest }: InputProps) {
  return (
    <Field id={id} text={text} error={error} hint={hint} className={className}>
      <div className="glass-input flex h-11 items-center gap-1.5 rounded-lg px-3" data-invalid={!!error || undefined}>
        {prefix && <span aria-hidden className="text-sm font-semibold text-slate-400">{prefix}</span>}
        <input id={id} value={value} onChange={(e) => onValue(e.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-navy outline-none placeholder:text-slate-400" {...rest} />
        {suffix && <span className="text-xs font-semibold text-slate-400">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SelectField({ id, text, value, onValue, options, error, className, emptyLabel }: { id: string; text: string; value: string; onValue: (v: string) => void; options: { value: string; label: string }[]; error?: string; className?: string; emptyLabel?: string }) {
  return (
    <Field id={id} text={text} error={error} className={className}>
      <div className="glass-input relative flex h-11 items-center rounded-lg pl-3 pr-9" data-invalid={!!error || undefined}>
        <select id={id} value={value} onChange={(e) => onValue(e.target.value)} className="h-full w-full cursor-pointer appearance-none bg-transparent text-sm font-medium text-navy outline-none">
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-400" aria-hidden />
      </div>
    </Field>
  );
}

export function TextArea({ id, text, value, onValue, error, hint, rows = 4, max }: { id: string; text: string; value: string; onValue: (v: string) => void; error?: string; hint?: string; rows?: number; max?: number }) {
  return (
    <Field id={id} text={text} error={error} hint={hint}>
      <textarea id={id} value={value} rows={rows} maxLength={max} onChange={(e) => onValue(e.target.value)} aria-invalid={!!error || undefined}
        className="glass-input w-full resize-y rounded-lg px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-400" data-invalid={!!error || undefined} />
    </Field>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={clsx("h-9 rounded-full border px-4 text-[0.82rem] font-semibold transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48BDFA]",
        on ? "border-transparent bg-brand-gradient text-white shadow-[0_6px_16px_-8px_rgba(244,19,230,0.6)]" : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white")}>
      {children}
    </button>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3 border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <h3 id={id} className="text-sm font-bold text-navy">{title}</h3>
      {children}
    </section>
  );
}
