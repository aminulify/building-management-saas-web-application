"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, Check, Loader2, Mail, Phone, SearchX, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { isFullPhone, normalizePhone } from "./schema";
import type { LookupResult, TenantMatch } from "./types";

export function Avatar({ name, url, size = "size-9" }: { name: string; url?: string | null; size?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" loading="lazy" className={`${size} shrink-0 rounded-full object-cover`} />;
  return <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-fuchsia-300 text-xs font-bold text-white`}>{initials || "?"}</span>;
}

interface Props { value: TenantMatch | null; onChange: (t: TenantMatch | null) => void; disabled?: boolean; /** also accept an e-mail address (Tenants Directory); default is phone number only */ allowEmail?: boolean; autoFocus?: boolean; /** accessible name of the search box (the visible label lives outside this component) */ label?: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * "Find by phone number": type a full mobile number and the registered tenant appears. Only an exact, complete
 * number is looked up, so the list of tenants cannot be browsed. No tenant chosen = the unit stays Vacant.
 */
export function TenantPicker({ value, onChange, disabled, allowEmail = false, autoFocus = false, label }: Props) {
  const t = useTranslations("owner.units.tenant");
  const id = useId();
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<"idle" | "looking" | "notFound" | "found" | "error">("idle");
  const [match, setMatch] = useState<TenantMatch | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const asEmail = allowEmail && raw.includes("@");
  const phone = normalizePhone(raw);
  const email = raw.trim().toLowerCase();
  const query = asEmail ? (EMAIL.test(email) ? `email=${encodeURIComponent(email)}` : null) : isFullPhone(phone) ? `phone=${phone}` : null;

  useEffect(() => {
    setMatch(null);
    setMessage(null);
    if (!raw.trim()) { setState("idle"); return; }
    if (!query) { setState("idle"); return; }
    let off = false;
    setState("looking");
    const timer = setTimeout(async () => {
      try {
        const r = await authApi<LookupResult>(`/tenancies/lookup?${query}`);
        if (off) return;
        if (r.found) { setMatch(r.tenant); setState("found"); } else setState("notFound");
      } catch (e) {
        if (off) return;
        setState("error");
        setMessage(e instanceof ApiError && e.code === "RATE_LIMITED" ? t("rateLimited") : e instanceof ApiError && e.code === "NETWORK" ? t("network") : t("error"));
      }
    }, 250);
    return () => { off = true; clearTimeout(timer); };
  }, [query, raw, t]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50/80 px-3 py-2.5">
        <Avatar name={value.fullName} url={value.avatarUrl} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-navy">{value.fullName}</p><p className="truncate text-xs text-slate-600">{[value.phone, value.email].filter(Boolean).join(" · ")}</p></div>
        <span className="hidden items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 sm:inline-flex"><Check className="size-3" aria-hidden />{t("selected")}</span>
        <button type="button" disabled={disabled} onClick={() => { onChange(null); setRaw(""); }} aria-label={t("remove")} className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-red-600"><X className="size-4" aria-hidden /></button>
      </div>
    );
  }

  return (
    <div>
      <div className="glass-input flex h-12 items-center gap-3 rounded-lg px-3">
        {asEmail ? <Mail className="size-5 shrink-0 text-slate-400" aria-hidden /> : <Phone className="size-5 shrink-0 text-slate-400" aria-hidden />}
        <input
          id={id} type={allowEmail ? "text" : "tel"} inputMode={allowEmail ? "email" : "tel"} autoComplete="off" autoFocus={autoFocus} data-autofocus={autoFocus || undefined} value={raw} onChange={(e) => setRaw(e.target.value)} disabled={disabled} placeholder={allowEmail ? t("placeholderAny") : t("placeholder")} aria-describedby={`${id}-s`} aria-label={label}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-navy outline-none placeholder:text-slate-300"
        />
        {state === "looking" && <Loader2 className="size-4 animate-spin text-slate-400" aria-hidden />}
      </div>
      <div id={`${id}-s`} aria-live="polite" className="mt-1.5 text-xs">
        {state === "idle" && <p className="text-label">{raw.trim() ? (allowEmail ? t("keepTypingAny") : t("keepTyping")) : allowEmail ? t("hintAny") : t("hint")}</p>}
        {state === "notFound" && <p className="flex items-center gap-1.5 font-medium text-amber-700"><SearchX className="size-3.5" aria-hidden />{t("notFound")}</p>}
        {state === "error" && <p role="alert" className="flex items-center gap-1.5 font-medium text-red-600"><AlertTriangle className="size-3.5" aria-hidden />{message}</p>}
      </div>
      {state === "found" && match && (
        <button
          type="button" disabled={disabled || match.hasActiveTenancy} onClick={() => onChange(match)}
          className="mt-2 flex w-full items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2.5 text-left transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:border-sky-400 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Avatar name={match.fullName} url={match.avatarUrl} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-navy">{match.fullName}</span><span className="block truncate text-xs text-slate-600">{[match.phone, match.email].filter(Boolean).join(" · ")}</span></span>
          {match.hasActiveTenancy ? <span className="flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="size-3.5" aria-hidden />{t("alreadyRenting")}</span> : <span className="flex items-center gap-1 text-xs font-bold text-sky-700"><UserRound className="size-3.5" aria-hidden />{t("select")}</span>}
        </button>
      )}
    </div>
  );
}
