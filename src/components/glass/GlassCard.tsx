import { clsx } from "clsx";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** subtle lift + stronger shadow on hover (cards that are clickable or informative) */
  lift?: boolean;
}

export function GlassCard({ className, lift = false, ...rest }: Props) {
  return (
    <div
      className={clsx("glass-card", lift && "transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_50px_-18px_rgba(123,47,247,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0", className)}
      {...rest}
    />
  );
}
