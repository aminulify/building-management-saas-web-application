/**
 * Tenant statement PDF drawn in the browser with jsPDF (loaded only when "Download" is clicked). English labels and
 * "BDT": the built-in PDF fonts have no Bengali glyphs, so Bengali text is replaced with "?" instead of broken boxes.
 */
import { statementFileName } from "./logic";
import type { PastDetail } from "./types";

type RGB = [number, number, number];
const NAVY: RGB = [15, 23, 42];
const GREY: RGB = [100, 116, 139];
const BRAND: RGB = [123, 47, 247];

const safe = (s: string | null | undefined) => (s ?? "").replace(/[^\u0000-ÿ]/g, "?");
const money = (v: number) => `BDT ${new Intl.NumberFormat("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v)}`;
const day = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso)) : "-");
const month = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
const STATUS = { PAID_ON_TIME: "Paid on time", PAID_LATE: "Paid late", DEFAULTED: "Defaulted" } as const;
const REASON = { JOB_TRANSFER: "Job transfer", PURCHASED_HOME: "Purchased home", UPGRADED_UNIT: "Upgraded unit", LEASE_EXPIRED: "Lease expired", OTHER: "Other reason" } as const;
const RATING = { EXCELLENT: "Excellent", GOOD: "Good", AVERAGE: "Average", UGLY: "Ugly", BAD: "Bad", VERY_BAD: "Very bad" } as const;

async function logo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch("/images/amaderghor-logo-EN.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(blob); });
    return { data, w: 543, h: 95 };
  } catch { return null; }
}

/** Draws the statement and starts the download. Returns the file name. */
export async function downloadStatementPdf(d: PastDetail): Promise<string> {
  const [{ jsPDF }, { autoTable }, lg] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logo()]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;

  if (lg) doc.addImage(lg.data, "PNG", M, 36, (lg.w / lg.h) * 32, 32);
  else doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...BRAND).text("AmaderGhor", M, 60);
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...NAVY).text("TENANT STATEMENT", W - M, 56, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...GREY).text(`Generated ${day(new Date().toISOString())}`, W - M, 72, { align: "right" });
  doc.setDrawColor(226, 232, 240).line(M, 90, W - M, 90);

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...GREY).text("TENANT", M, 112).text("RESIDENCY", W / 2 + 10, 112);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...NAVY);
  [safe(d.tenant?.fullName), safe(d.tenant?.phone), safe(d.tenant?.email), d.tenant?.nid ? `NID: ${d.tenant.nid}` : "", `Family members: ${d.members}`].filter(Boolean).forEach((l, i) => doc.text(l, M, 130 + i * 15));
  [`${safe(d.property.name)} - Unit ${safe(d.unit.unitNumber)}`, `Move-in: ${day(d.startDate)}`, `Move-out: ${day(d.endDate)}`, `Reason: ${d.leaveReason ? REASON[d.leaveReason] : "-"}`, `Behaviour: ${d.behavior ? RATING[d.behavior] : "Not rated"}`].forEach((l, i) => doc.text(l, W / 2 + 10, 130 + i * 15));

  autoTable(doc, {
    startY: 225, margin: { left: M, right: M },
    head: [["Month", "Due", "Paid", "Balance", "Status"]],
    body: d.ledger.length ? d.ledger.map((r) => [month(r.billingMonth), money(r.total), money(r.paid), money(r.due), STATUS[r.status]]) : [["No rent records", "", "", "", ""]],
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 6, textColor: NAVY },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  if (y > 700) { doc.addPage(); y = 60; }

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...GREY).text("SUMMARY", M, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...NAVY);
  [
    `Total rent collected: ${money(d.summary.collected)}`,
    `On-time payment rate: ${d.summary.onTimeRate === null ? "-" : `${d.summary.onTimeRate}% (${d.summary.onTime} of ${d.summary.months} months)`}`,
    `Remaining dues at checkout: ${money(d.summary.dues)}`,
    `Security deposit: ${money(d.deposit)}${d.settlementAmount !== null ? `   Settlement: ${money(d.settlementAmount)}` : ""}`,
  ].forEach((l, i) => doc.text(l, M, y + 18 + i * 16));

  const name = statementFileName(d.tenant?.fullName ?? "tenant", d.endDate);
  doc.save(name);
  return name;
}
