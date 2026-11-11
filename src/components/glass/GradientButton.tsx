import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "glass" | "success" | "danger" | "white";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  /** fill the row (e.g. the full-width Login button) */
  block?: boolean;
}

// every filled button shares the brand gradient; "success" is a semantic alias of it
const CLASS: Record<Variant, string> = { primary: "btn-primary", glass: "btn-glass", success: "btn-primary", danger: "btn-danger", white: "btn-white" };

export function GradientButton({ variant = "primary", loading = false, block = false, className, children, disabled, type = "button", ...rest }: Props) {
  return (
    <button
      suppressHydrationWarning // browser extensions (form fillers) add attributes to buttons before React starts
      type={type}
      className={clsx("btn", CLASS[variant], block && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Link that looks like a button (used for navigation, e.g. "Login"). */
export function buttonClass(variant: Variant = "primary", block = false) {
  return clsx("btn", CLASS[variant], block && "w-full");
}
