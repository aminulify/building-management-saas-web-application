"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export function ErrorBanner({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{message}
    </div>
  );
}
