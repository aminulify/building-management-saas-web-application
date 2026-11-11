"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClass, GradientButton } from "@/components/glass/GradientButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { hl } from "@/components/typography/highlight";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { Logo } from "@/components/layout/Logo";
import { FadeIn } from "@/components/motion/FadeIn";
import { api, ApiError } from "@/lib/api-client";
import { setSession } from "@/lib/auth-client";
import { useAvailability } from "../hooks";
import { normalizePhone, personalSchema, registerFormSchema, STEP_FIELDS, stepOfField, type RegisterFormValues } from "../schema";
import { uploadRegistrationFile, type RegUploadPurpose } from "../upload";
import { RegisterSuccess } from "./RegisterSuccess";
import { StepAddress } from "./StepAddress";
import { StepDocuments, type DocErrors, type DocStates, type Docs } from "./StepDocuments";
import { StepPersonal } from "./StepPersonal";
import { StepSecurity } from "./StepSecurity";
import { Stepper } from "./Stepper";

type Step = 1 | 2 | 3 | 4;
const EMPTY_DOCS: Docs = { nidFront: null, nidBack: null, photo: null };
const IDLE: DocStates = { nidFront: "idle", nidBack: "idle", photo: "idle" };
const PURPOSE: Record<keyof Docs, RegUploadPurpose> = { nidFront: "NID_FRONT", nidBack: "NID_BACK", photo: "AVATAR" };
const fingerprint = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

interface Result { needsEmailConfirmation: boolean; email: string; documentsReceived: boolean }

export function RegisterWizard() {
  const t = useTranslations("auth.register");
  const e = useTranslations("errors");
  const locale = useLocale();

  const methods = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    mode: "onTouched",
    defaultValues: { fullName: "", username: "", email: "", phone: "", occupation: "", dateOfBirth: "", nid: "", division: "", district: "", upazila: "", union: "", street: "", postOffice: "", password: "", confirmPassword: "", consent: false },
  });
  const { control, trigger, handleSubmit, setError } = methods;

  const [step, setStep] = useState<Step>(1);
  const [dir, setDir] = useState(1);
  const [docs, setDocs] = useState<Docs>(EMPTY_DOCS);
  const [states, setStates] = useState<DocStates>(IDLE);
  const [docErrors, setDocErrors] = useState<DocErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const session = useRef<string>("");
  const uploaded = useRef<Partial<Record<keyof Docs, string>>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // buttons stay disabled until React has attached the handlers, so an early click can never submit the form natively
  const [ready, setReady] = useState(false);
  useEffect(() => { session.current = crypto.randomUUID(); setReady(true); }, []);

  /* ---------- live availability (username / email / phone) ---------- */
  const username = useWatch({ control, name: "username" }) ?? "";
  const email = useWatch({ control, name: "email" }) ?? "";
  const phone = useWatch({ control, name: "phone" }) ?? "";
  const uName = username.trim().toLowerCase();
  const uMail = email.trim().toLowerCase();
  const uPhone = normalizePhone(phone);
  const availability = {
    username: useAvailability("username", uName, personalSchema.shape.username.safeParse(uName).success),
    email: useAvailability("email", uMail, personalSchema.shape.email.safeParse(uMail).success),
    phone: useAvailability("phone", uPhone, /^01[3-9]\d{8}$/.test(uPhone)),
  };

  // an error that appears below the fold must not go unnoticed
  useEffect(() => { if (banner) bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [banner]);

  const goTo = useCallback((next: Step) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
    setBanner(null);
    requestAnimationFrame(() => heading.current?.focus());
  }, [step]);

  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (!ok) return;
    if (step === 1 && Object.values(availability).includes("taken")) return;
    goTo((step + 1) as Step);
  }

  /* ---------- server errors → field errors / banner ---------- */
  function applyServerError(err: unknown) {
    if (!(err instanceof ApiError)) { setBanner(t("errors.network")); return; }
    if (err.code === "CONFLICT" && err.field) {
      const f = err.field as "username" | "email" | "phone" | "nid";
      setError(f, { message: `${f}Taken` });
      goTo(1);
      return;
    }
    if (err.code === "VALIDATION_ERROR" && err.issues.length) {
      let first: Step = 4;
      for (const i of err.issues) {
        const path = (i.path ?? "").replace(/^address\./, "");
        if (!path) continue;
        setError(path as keyof RegisterFormValues, { message: "serverInvalid" });
        first = Math.min(first, stepOfField(path)) as Step;
      }
      goTo(first);
      return;
    }
    if (err.code === "RATE_LIMITED") { setBanner(err.reason === "email_send_limit" ? t("errors.emailLimit") : e("RATE_LIMITED")); return; }
    if (err.code === "NETWORK") { setBanner(t("errors.network")); return; }
    setBanner(e.has(err.code) ? e(err.code) : e("INTERNAL"));
  }

  function validateDocs(): boolean {
    const missing: DocErrors = {};
    if (!docs.nidFront) missing.nidFront = t("errors.nidFrontRequired");
    if (!docs.nidBack) missing.nidBack = t("errors.nidBackRequired");
    setDocErrors(missing);
    return Object.keys(missing).length === 0;
  }

  /* ---------- final submit ---------- */
  const submit = handleSubmit(async (v) => {
    setBanner(null);
    if (!validateDocs()) return;

    setSubmitting(true);
    try {
      for (const key of ["nidFront", "nidBack", "photo"] as const) {
        const f = docs[key];
        if (!f || uploaded.current[key] === fingerprint(f)) continue; // already in storage from an earlier attempt
        setStates((s) => ({ ...s, [key]: "uploading" }));
        try {
          await uploadRegistrationFile(session.current, PURPOSE[key], f);
          uploaded.current[key] = fingerprint(f);
          setStates((s) => ({ ...s, [key]: "done" }));
        } catch (err) {
          setStates((s) => ({ ...s, [key]: "error" }));
          if (err instanceof ApiError && err.code === "RATE_LIMITED") throw err;
          setBanner(t("errors.uploadFailed"));
          return;
        }
      }

      const res = await api<{ needsEmailConfirmation: boolean; session: { accessToken: string; refreshToken: string; expiresAt: number | null } | null; documents: { nidFront: boolean; nidBack: boolean } | null }>("/auth/register", {
        method: "POST",
        body: {
          fullName: v.fullName.trim(),
          username: v.username.trim().toLowerCase(),
          email: v.email.trim().toLowerCase(),
          phone: normalizePhone(v.phone),
          password: v.password,
          nid: v.nid.trim(),
          occupation: v.occupation.trim() || undefined,
          dateOfBirth: v.dateOfBirth,
          locale,
          consent: true,
          uploadSession: session.current,
          address: {
            division: v.division, district: v.district, upazila: v.upazila.trim(),
            union: v.union.trim() || undefined, street: v.street.trim(), postOffice: v.postOffice.trim() || undefined,
          },
        },
      });
      if (res.session) setSession(res.session);
      setResult({ needsEmailConfirmation: res.needsEmailConfirmation, email: v.email.trim().toLowerCase(), documentsReceived: !!(res.documents?.nidFront && res.documents?.nidBack) });
    } catch (err) {
      applyServerError(err);
    } finally {
      setSubmitting(false);
    }
  }, (errs) => {
    // some earlier step is invalid (e.g. user edited then jumped): open the first one
    const first = Math.min(...Object.keys(errs).map((k) => stepOfField(k))) as Step;
    if (first < step) goTo(first);
  });

  const isLast = step === 4;

  if (result) {
    return (
      <GlassCard className="mx-auto w-full max-w-5xl p-6 sm:p-10 lg:p-12">
        <div className="mb-6 flex items-center justify-between"><Logo /><LangSwitch /></div>
        <RegisterSuccess {...result} />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="mx-auto w-full max-w-5xl p-6 sm:p-10 lg:p-12">
      <FadeIn>
        <div className="mb-6 flex items-start justify-between gap-4">
          <Logo />
          <LangSwitch />
        </div>
        <h1 className="text-[1.75rem] font-bold leading-snug text-navy sm:text-[2.1rem]">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">{t("subtitle")}</p>
        <hr className="mt-5 border-slate-400/60" />
      </FadeIn>

      <FadeIn delay={0.08} className="mt-5">
        <p className="mb-2 text-sm font-medium text-navy">{t("haveAccount")}</p>
        <Link href="/login" className={buttonClass("primary", true)}>{t("login")}</Link>
      </FadeIn>

      <FadeIn delay={0.14} className="mt-8"><Stepper current={step} onJump={goTo} /></FadeIn>

      <FormProvider {...methods}>
        <form noValidate method="post" onSubmit={(ev) => { ev.preventDefault(); if (!isLast) { void next(); return; } if (!validateDocs()) { void trigger("consent"); return; } void submit(); }} className="mt-8" aria-labelledby="step-heading">
          <div className="min-h-[24rem] overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.section
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: dir * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -28 }}
                transition={{ duration: 0.35 }}
              >
                <h2 id="step-heading" ref={heading} tabIndex={-1} className="text-2xl font-semibold leading-snug text-navy outline-none sm:text-[1.7rem]">{t.rich(`stepTitles.${(["personal", "address", "security", "documents"] as const)[step - 1]}`, { hl })}</h2>
                <p className="mb-6 mt-1 text-sm text-slate-600">{t(`stepHints.${(["personal", "address", "security", "documents"] as const)[step - 1]}`)}</p>

                {step === 1 && <StepPersonal availability={availability} />}
                {step === 2 && <StepAddress />}
                {step === 3 && <StepSecurity />}
                {step === 4 && (
                  <StepDocuments
                    docs={docs}
                    onDocs={(patch) => { setDocs((d) => ({ ...d, ...patch })); setDocErrors({}); setStates((s) => ({ ...s, ...Object.fromEntries(Object.keys(patch).map((k) => [k, "idle"])) })); }}
                    states={states}
                    errors={docErrors}
                  />
                )}
              </motion.section>
            </AnimatePresence>
          </div>

          {banner && (
            <div ref={bannerRef} role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{banner}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 1 ? (
              <GradientButton variant="glass" onClick={() => goTo((step - 1) as Step)} disabled={submitting} className="min-w-28">
                <ChevronLeft className="size-5" aria-hidden />{t("back")}
              </GradientButton>
            ) : <span />}

            {isLast ? (
              <GradientButton type="submit" variant="success" loading={submitting} disabled={!ready} className="min-w-52">
                {submitting ? t("submitting") : t("complete")}{!submitting && <Check className="size-5" aria-hidden />}
              </GradientButton>
            ) : (
              <GradientButton type="submit" disabled={!ready} className="min-w-44">
                {t("next")}<ChevronRight className="size-5" aria-hidden />
              </GradientButton>
            )}
          </div>
        </form>
      </FormProvider>
    </GlassCard>
  );
}
