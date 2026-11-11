/**
 * PDF files are drawn in the browser with jsPDF (loaded only when a button is clicked, so it never slows the page).
 * Documents use English labels and "BDT" so every viewer shows them correctly: the built-in PDF fonts have no
 * Bengali glyphs, and names written in Bengali script are replaced with "?" rather than printed as broken boxes.
 */
import type { LedgerItem, RentReceipt, RentReport } from "./types";

type RGB = [number, number, number];

const safe = (s: string | null | undefined) => (s ?? "").replace(/[^\u0000-ÿ]/g, "?");
const money = (v: string | number) => `BDT ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: Number(v) % 1 ? 2 : 0 }).format(Number(v))}`;
const date = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "-");
const stamp = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const monthTitle = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, mo! - 1, 1)));
};
const STATUS = { PAID: "Paid", UNPAID: "Unpaid", OVERDUE: "Overdue" } as const;
const FILTER = { all: "All", paid: "Paid", unpaid: "Unpaid + Overdue" } as const;
const METHOD: Record<string, string> = { CASH: "Cash", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket", BANK: "Bank transfer", CARD: "Card" };

const NAVY: RGB = [15, 23, 42];
const GREY: RGB = [100, 116, 139];
const BRAND: RGB = [123, 47, 247];
const GREEN: RGB = [22, 163, 74];
const RED: RGB = [185, 28, 28];
const AMBER: RGB = [180, 83, 9];

export async function logo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch("/images/amaderghor-logo-EN.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(blob); });
    return { data, w: 543, h: 95 };
  } catch { return null; }
}

/** Report for the filters on screen: header, KPI block, then every matching tenant row. Returns the file name. */
export async function downloadReportPdf(r: RentReport): Promise<string> {
  const [{ jsPDF }, { autoTable }, lg] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logo()]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  if (lg) doc.addImage(lg.data, "PNG", M, 30, (lg.w / lg.h) * 30, 30);
  else doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...BRAND).text("AmaderGhor", M, 52);
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...NAVY).text("Rent Report", W - M, 48, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GREY).text(`Generated ${stamp(r.generatedAt)}`, W - M, 62, { align: "right" });
  doc.setDrawColor(226, 232, 240).line(M, 76, W - M, 76);

  doc.setFontSize(11).setTextColor(...NAVY).setFont("helvetica", "bold").text(monthTitle(r.month), M, 96);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GREY);
  const filters = [
    `Owner: ${safe(r.owner.fullName)}${r.owner.ownerCode ? ` (${r.owner.ownerCode})` : ""}`,
    `Property: ${r.property ? safe(r.property) : "All properties"}`,
    `Status: ${FILTER[r.status]}`,
    ...(r.search ? [`Search: "${safe(r.search)}"`] : []),
  ];
  doc.text(filters.join("   |   "), M, 111, { maxWidth: W - 2 * M });

  const s = r.stats;
  const kpis: [string, string, RGB][] = [
    ["Total expected", money(s.expected), NAVY],
    ["Total collected", money(s.collected), GREEN],
    ["Pending", money(s.pending), AMBER],
    ["Collection", `${s.collectionRate}%`, BRAND],
    ["Overdue records", `${s.overdueCount} (${money(s.overdueAmount)})`, RED],
    ["Total still due", money(s.dueAmount), RED],
  ];
  const bw = (W - 2 * M - 2 * 10) / 3;
  kpis.forEach(([label, value, color], i) => {
    const x = M + (i % 3) * (bw + 10);
    const y = 128 + Math.floor(i / 3) * 56;
    doc.setFillColor(248, 250, 252).setDrawColor(226, 232, 240).roundedRect(x, y, bw, 46, 6, 6, "FD");
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text(label.toUpperCase(), x + 10, y + 16);
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...color).text(value, x + 10, y + 34, { maxWidth: bw - 16 });
  });

  autoTable(doc, {
    startY: 248,
    head: [["Tenant / Unit", "Property", "Due date", "Amount", "Paid", "Status", "Paid date"]],
    body: r.rows.length
      ? r.rows.map((x: LedgerItem) => [
          `${safe(x.tenant)}\nUnit ${x.unit}${x.carriedOver ? `  (from ${monthTitle(x.billingMonth)})` : ""}`,
          safe(x.property), date(x.dueDate), money(x.total), money(x.paid), STATUS[x.status] + (x.partial ? " (partial)" : ""), date(x.paidAt),
        ])
      : [[{ content: "No rent records match these filters.", colSpan: 7, styles: { halign: "center", textColor: GREY } }]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: NAVY },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 5) {
        const t = String(d.cell.raw);
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = t.startsWith("Paid") ? GREEN : t.startsWith("Overdue") ? RED : AMBER;
      }
    },
    margin: { left: M, right: M, bottom: 40 },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY);
    doc.text("AmaderGhor - rent report", M, H - 20);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 20, { align: "right" });
  }
  const slug = r.property ? `-${safe(r.property).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  const file = `rent-report-${r.month}${slug}.pdf`;
  doc.save(file);
  return file;
}

/** Itemised receipt for one payment. Returns the file name. */
export async function downloadReceiptPdf(c: RentReceipt): Promise<string> {
  const [{ jsPDF }, { autoTable }, lg] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logo()]);
  const doc = new jsPDF({ unit: "pt", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 32;

  if (lg) doc.addImage(lg.data, "PNG", M, 26, (lg.w / lg.h) * 26, 26);
  else doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...BRAND).text("AmaderGhor", M, 46);
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...NAVY).text("Rent Receipt", W - M, 42, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text(`No. ${c.receiptNo}`, W - M, 56, { align: "right" });
  doc.setDrawColor(226, 232, 240).line(M, 70, W - M, 70);

  doc.setFillColor(240, 253, 244).setDrawColor(134, 239, 172).roundedRect(M, 82, W - 2 * M, 54, 8, 8, "FD");
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text("AMOUNT RECEIVED", M + 14, 100);
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...GREEN).text(money(c.amount), M + 14, 124);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text(`Paid on ${date(c.issuedAt)}`, W - M - 14, 124, { align: "right" });

  autoTable(doc, {
    startY: 152,
    theme: "plain",
    body: [
      ["Tenant", safe(c.tenant?.fullName)],
      ["Property", `${safe(c.property)} - Unit ${c.unit} (floor ${c.floor})`],
      ["Rent month", monthTitle(c.billingMonth)],
      ["Payment method", METHOD[c.method] ?? c.method],
      ["Reference / TrxID", c.reference ?? "-"],
      ["Rent for the month", money(c.recordTotal)],
      ["Paid so far", money(c.recordPaid)],
      ["Balance", money(c.balance)],
      ["Received by (owner)", safe(c.owner?.fullName) + (c.owner?.ownerCode ? ` (${c.owner.ownerCode})` : "")],
    ],
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: NAVY },
    columnStyles: { 0: { textColor: GREY, cellWidth: 110 }, 1: { fontStyle: "bold" } },
    margin: { left: M, right: M },
  });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text("This is a computer-generated receipt and needs no signature.", W / 2, H - 28, { align: "center" });
  const file = `rent-receipt-${c.receiptNo}.pdf`;
  doc.save(file);
  return file;
}
