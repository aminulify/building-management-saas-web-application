"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { PasswordToggle as Toggle } from "@/components/glass/PasswordToggle";
import { passwordScore, type RegisterFormValues } from "../schema";
import { useFieldError } from "./useFieldError";

const BAR = ["bg-slate-200", "bg-red-400", "bg-amber-400", "bg-lime-500", "bg-emerald-500"];

export function StepSecurity() {
  const t = useTranslations("auth.register");
  const { register, control, formState: { errors } } = useFormContext<RegisterFormValues>();
  const err = useFieldError<RegisterFormValues>();
  const [show, setShow] = useState({ pw: false, confirm: false });
  const pw = useWatch({ control, name: "password" }) ?? "";
  const confirm = useWatch({ control, name: "confirmPassword" }) ?? "";
  const score = passwordScore(pw);

  const rules = [
    { ok: pw.length >= 8, text: t("rules.length") },
    { ok: /[A-Za-z]/.test(pw), text: t("rules.letter") },
    { ok: /\d/.test(pw), text: t("rules.digit") },
  ];

  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
      <div className="space-y-5">
        <GlassField label={t("fields.password")} htmlFor="password" error={err("password")}>
          <GlassInput
            id="password" type={show.pw ? "text" : "password"} icon={Lock} autoComplete="new-password" placeholder="••••••••••"
            invalid={!!errors.password} right={<Toggle shown={show.pw} onClick={() => setShow((s) => ({ ...s, pw: !s.pw }))} label={show.pw ? t("hidePassword") : t("showPassword")} />}
            {...register("password")}
          />
        </GlassField>

        <GlassField label={t("fields.confirmPassword")} htmlFor="confirmPassword" error={err("confirmPassword")}>
          <GlassInput
            id="confirmPassword" type={show.confirm ? "text" : "password"} icon={Lock} autoComplete="new-password" placeholder="••••••••••"
            invalid={!!errors.confirmPassword} right={<Toggle shown={show.confirm} onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} label={show.confirm ? t("hidePassword") : t("showPassword")} />}
            {...register("confirmPassword")}
          />
          {confirm && pw === confirm && !errors.confirmPassword && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Check className="size-3.5" aria-hidden />{t("passwordsMatch")}</p>
          )}
        </GlassField>
      </div>

      {/* live strength + rule checklist */}
      <div className="glass-card self-start rounded-2xl p-5" aria-live="polite">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-label">{t("strength.title")}</p>
        <div className="mb-1 flex gap-1.5" role="img" aria-label={t(`strength.level${score}`)}>
          {[1, 2, 3, 4].map((i) => <span key={i} className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-300", score >= i ? BAR[score] : "bg-slate-200")} />)}
        </div>
        <p className="mb-4 text-sm font-semibold text-navy">{t(`strength.level${score}`)}</p>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.text} className={clsx("flex items-center gap-2 text-sm transition-colors", r.ok ? "text-emerald-700" : "text-label")}>
              <span className={clsx("grid size-4 place-items-center rounded-full border transition-colors", r.ok ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300")}>
                {r.ok && <Check className="size-3" strokeWidth={3} aria-hidden />}
              </span>
              {r.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
