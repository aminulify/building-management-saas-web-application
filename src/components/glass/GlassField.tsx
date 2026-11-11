import { useId } from "react";
import { clsx } from "clsx";
import { AlertCircle, ChevronDown, type LucideIcon } from "lucide-react";

/* ---------- label + hint + error wrapper ---------- */
interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  /** link/action shown on the label row, right-aligned */
  labelRight?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function GlassField({ label, htmlFor, error, hint, labelRight, className, children }: FieldProps) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-wider text-label">
          {label}
        </label>
        {labelRight}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-label">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------- text input with a left icon and an optional right slot ---------- */
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  icon: LucideIcon;
  invalid?: boolean;
  right?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

export function GlassInput({ id, icon: Icon, invalid, right, className, ref, ...rest }: InputProps) {
  return (
    <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={invalid || undefined}>
      <Icon className="size-5 shrink-0 text-slate-400" aria-hidden />
      <input
        suppressHydrationWarning // browser extensions (form fillers) add attributes to inputs before React starts
        id={id}
        ref={ref}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={clsx("h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-300", className)}
        {...rest}
      />
      {right}
    </div>
  );
}

/* ---------- native select (best on phones) with a left icon ---------- */
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  icon: LucideIcon;
  invalid?: boolean;
  loading?: boolean;
  ref?: React.Ref<HTMLSelectElement>;
}

export function GlassSelect({ id, icon: Icon, invalid, loading, className, children, ref, ...rest }: SelectProps) {
  return (
    <div className="glass-input relative flex h-12 items-center gap-3 rounded-lg px-3" data-invalid={invalid || undefined}>
      <Icon className="size-5 shrink-0 text-slate-400" aria-hidden />
      <select suppressHydrationWarning
        id={id}
        ref={ref}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        aria-busy={loading || undefined}
        className={clsx("h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-7 text-[0.95rem] text-navy outline-none disabled:cursor-not-allowed disabled:text-slate-400", className)}
        {...rest}
      >
        {children}
      </select>
      {loading ? <span className="skeleton absolute right-3 h-3 w-6" aria-hidden /> : <ChevronDown className="pointer-events-none absolute right-3 size-4 text-slate-400" aria-hidden />}
    </div>
  );
}

/** stable ids for fields that are rendered several times */
export function useFieldId(name: string) {
  return `${name}-${useId().replace(/:/g, "")}`;
}
