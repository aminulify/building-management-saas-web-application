import { Eye, EyeOff } from "lucide-react";

/** Eye / eye-off button for password inputs (swap the input type between password and text). */
export function PasswordToggle({ shown, onClick, label }: { shown: boolean; onClick: () => void; label: string }) {
  const Icon = shown ? Eye : EyeOff;
  return (
    <button suppressHydrationWarning type="button" onClick={onClick} aria-label={label} aria-pressed={shown} className="rounded-md p-1 text-navy/80 transition-colors hover:bg-white/80 hover:text-navy">
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
