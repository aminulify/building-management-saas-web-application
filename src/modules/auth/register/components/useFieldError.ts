"use client";

import { useFormContext, type FieldValues } from "react-hook-form";
import { useTranslations } from "next-intl";

/** Translated error text for a field, or undefined. The schema returns `validation.*` keys (or free text from the server). */
export function useFieldError<T extends FieldValues = FieldValues>() {
  const v = useTranslations("validation");
  const { formState: { errors } } = useFormContext<T>();
  return (name: string): string | undefined => {
    const msg = (errors as Record<string, { message?: unknown } | undefined>)[name]?.message;
    if (!msg || typeof msg !== "string") return undefined;
    return v.has(msg) ? v(msg) : msg;
  };
}
