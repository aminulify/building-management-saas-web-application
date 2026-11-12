/** What a Find People search text can be. Pure rules (no database), so they are easy to test. */
export interface SearchKinds {
  /** 13 to 17 digits: a Bangladesh NID number */
  nid?: string;
  /** 01XXXXXXXXX, also typed as +8801… or 8801… */
  phone?: string;
  email?: string;
  /** OW10032, TN10032, TF8812 … */
  code?: string;
  username?: string;
  /** the account id (uuid) */
  id?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Phone typed in any common way → the stored form 01XXXXXXXXX, or null. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  const local = d.startsWith("880") ? `0${d.slice(3)}` : d;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

/** Looks at the text once and says every kind of identifier it could be (a 13-digit text can be an NID or a phone with +880). */
export function classify(input: string): SearchKinds {
  const q = input.trim();
  const out: SearchKinds = {};
  if (!q) return out;
  if (UUID.test(q)) { out.id = q.toLowerCase(); return out; }
  if (q.includes("@")) { out.email = q.toLowerCase(); return out; }
  const digits = q.replace(/[\s\-().+]/g, "");
  if (/^\d+$/.test(digits)) {
    const phone = normalizePhone(q);
    if (phone) out.phone = phone;
    if (/^\d{13,17}$/.test(digits)) out.nid = digits;
    return out;
  }
  if (/^[A-Za-z]{2}\d{3,}$/.test(q)) out.code = q.toUpperCase();
  if (/^[A-Za-z0-9_.-]{3,40}$/.test(q)) out.username = q.toLowerCase();
  return out;
}

export const hasKind = (k: SearchKinds) => Object.keys(k).length > 0;

export const roleLabelKey = (role: string) => (role === "OWNER" ? "OWNER" : role === "TENANT" ? "TENANT" : "GENERAL_USER");
