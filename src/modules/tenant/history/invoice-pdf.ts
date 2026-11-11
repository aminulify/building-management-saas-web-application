/**
 * The tenant's PDF invoice, drawn in the browser with jsPDF (loaded only when "Invoice" is clicked).
 * Like the other PDFs it uses English labels and "BDT": the built-in PDF fonts have no Bengali glyphs, so names written
 * in Bengali script print as "?" instead of broken boxes.
 */
import { logo } from "../../owner/rent/pdf";
import type { Invoice } from "./types";

type RGB = [number, number, number];
const NAVY: RGB = [15, 23, 42];
const GREY: RGB = [100, 116, 139];
const GREEN: RGB = [22, 163, 74];
const LINE: RGB = [226, 232, 240];

const safe = (s: string | null | undefined) => (s ?? "").replace(/[^\u0000-ÿ]/g, "?");
const money = (v: string | number) => `BDT ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}`;
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(iso));
const monthTitle = (m: string) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const METHOD: Record<string, string> = { CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket", BANK: "Bank transfer", CARD: "Card" };

/** Draws the invoice and starts the download. Returns the file name. */
export async function downloadInvoicePdf(inv: Invoice): Promise<string> {
  const [{ jsPDF }, { autoTable }, lg] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logo()]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;

  // top-left logo, title on the right
  if (lg) doc.addImage(lg.data, "PNG", M, 36, (lg.w / lg.h) * 34, 34);
  else doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(123, 47, 247).text("AmaderGhor", M, 62);
  doc.setFont("helvetica", "bold").setFontSize(24).setTextColor(...NAVY).text("INVOICE", W - M, 56, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GREY).text(`No. ${inv.invoiceNo}`, W - M, 72, { align: "right" });
  doc.setDrawColor(...LINE).line(M, 92, W - M, 92);

  // invoice facts
  const methods = inv.methods.map((m) => METHOD[m] ?? m).join(", ");
  const facts: [string, string][] = [["Invoice #", inv.invoiceNo], ["Paid date", day(inv.paidAt)], ["Billing month", monthTitle(inv.billingMonth)], ["Payment method", methods + (inv.reference ? ` (${safe(inv.reference)})` : "")]];
  facts.forEach(([k, v], i) => {
    const x = M + (i % 2) * ((W - 2 * M) / 2);
    const y = 118 + Math.floor(i / 2) * 38;
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text(k.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...NAVY).text(v, x, y + 15);
  });

  // landlord and tenant
  const colW = (W - 2 * M - 16) / 2;
  const party = (x: number, title: string, rows: [string, string][]) => {
    doc.setFillColor(248, 250, 252).setDrawColor(...LINE).roundedRect(x, 204, colW, 124, 8, 8, "FD");
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...GREY).text(title, x + 14, 224);
    rows.forEach(([k, v], i) => {
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GREY).text(k, x + 14, 246 + i * 20);
      doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...NAVY).text(v, x + colW - 14, 246 + i * 20, { align: "right", maxWidth: colW - 90 });
    });
  };
  party(M, "LANDLORD", [["Name", safe(inv.owner?.fullName) || "-"], ["Owner ID", inv.owner?.ownerCode ?? "-"], ["Phone", inv.owner?.phone ?? "-"], ["Property", safe(inv.property)]]);
  party(M + colW + 16, "TENANT", [["Name", safe(inv.tenant?.fullName) || "-"], ["Username", safe(inv.tenant?.username) || "-"], ["Unit #", `${inv.unit} (floor ${inv.floor})`], ["Property", safe(inv.property)]]);

  // itemised rent summary
  const rows: [string, string][] = [["Monthly rent", money(inv.items.rent)]];
  if (Number(inv.items.utility) > 0) rows.push(["Utility charge", money(inv.items.utility)]);
  if (Number(inv.items.other) > 0) rows.push(["Other charges", money(inv.items.other)]);
  autoTable(doc, {
    startY: 352,
    head: [["Description", "Amount"]],
    body: rows,
    foot: [["Total", money(inv.total)]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, cellPadding: { top: 8, bottom: 8, left: 8, right: 8 }, textColor: NAVY },
    headStyles: { fontStyle: "bold", textColor: GREY, fontSize: 8.5, lineWidth: { bottom: 0.8 }, lineColor: LINE },
    footStyles: { fontStyle: "bold", fontSize: 12, textColor: NAVY, lineWidth: { top: 0.8 }, lineColor: LINE },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // payments received
  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 480;
  autoTable(doc, {
    startY: y + 22,
    head: [["Payment received", "Method", "Reference / TrxID", "Amount"]],
    body: inv.payments.map((p) => [day(p.paidAt), METHOD[p.method] ?? p.method, safe(p.reference) || "-", money(p.amount)]),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: NAVY },
    headStyles: { fontStyle: "bold", textColor: GREY, fontSize: 8, lineWidth: { bottom: 0.6 }, lineColor: LINE },
    columnStyles: { 3: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // PAID stamp
  const fy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 600) + 36;
  doc.setDrawColor(...GREEN).setLineWidth(2.2).roundedRect(W - M - 150, fy, 150, 54, 8, 8, "S");
  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(...GREEN).text("PAID", W - M - 75, fy + 28, { align: "center" });
  doc.setFontSize(8).text(`Verified ${day(inv.paidAt)}`, W - M - 75, fy + 44, { align: "center" });
  doc.setLineWidth(0.5);

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text("This is a computer-generated invoice and needs no signature. Payment was verified by the landlord on AmaderGhor.", W / 2, H - 30, { align: "center" });
  const file = `invoice-${inv.invoiceNo}.pdf`;
  doc.save(file);
  return file;
}
