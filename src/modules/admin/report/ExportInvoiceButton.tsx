"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { authApi } from "@/lib/auth-client";
import type { ReportBreakdown } from "./types";

/** "Export Invoice": asks the server for the sales of the chosen dates, then draws the PDF in the browser. */
export function ExportInvoiceButton({ from, to, disabled }: { from: string; to: string; disabled: boolean }) {
  const t = useTranslations("admin.report.export");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const data = await authApi<ReportBreakdown>(`/admin/report/breakdown?from=${from}&to=${to}`);
      const { downloadReportInvoice } = await import("./report-pdf");
      const file = await downloadReportInvoice(data);
      toast("success", t("done", { file }));
    } catch { toast("error", t("failed")); } finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={() => void run()} disabled={disabled || busy} aria-busy={busy || undefined} className="btn btn-primary h-11 px-4 text-sm">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileDown className="size-4" aria-hidden />}{busy ? t("working") : t("button")}
    </button>
  );
}
