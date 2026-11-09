import { clsx } from "clsx";
import { GlassCard } from "@/components/glass/GlassCard";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { Logo } from "@/components/layout/Logo";

/** The glass card used by every auth page: logo on the left, [BN | EN] pill on the right. */
export function AuthCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <GlassCard className={clsx("mx-auto w-full p-6 sm:p-10 lg:p-12", className)}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <Logo />
        <LangSwitch />
      </div>
      {children}
    </GlassCard>
  );
}
