"use client";

import { Check } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { passwordRules, RULE_KEYS } from "../schema";

/** Live rules: each bullet becomes a green check as soon as it is satisfied. */
export function PasswordChecklist({ password, confirm }: { password: string; confirm: string }) {
  const t = useTranslations("auth.recovery.reset.rules");
  const met = passwordRules(password, confirm);
  return (
    <ul className="space-y-2 rounded-xl border border-white/70 bg-white/50 px-4 py-4 backdrop-blur-sm" aria-label={t("label")}>
      {RULE_KEYS.map((k) => (
        <li key={k} className={clsx("flex items-center gap-3 text-sm transition-colors duration-300", met[k] ? "font-medium text-emerald-700" : "text-navy")}>
          <span
            aria-hidden
            className={clsx("grid size-5 shrink-0 place-items-center rounded-full border transition-all duration-300", met[k] ? "scale-100 border-emerald-500 bg-emerald-500 text-white" : "scale-90 border-slate-300 bg-white/70")}
          >
            {met[k] && <Check className="size-3" strokeWidth={3} />}
          </span>
          {t(k)}
          <span className="sr-only">{met[k] ? t("met") : t("unmet")}</span>
        </li>
      ))}
    </ul>
  );
}
