import { currentArea } from "./area";

/** Link that opens Find Home (in the area the sharer is in) with this home's details already showing. */
export const homeLink = (locale: string, id: string) => `${window.location.origin}/${locale}${currentArea()}/find-home?listing=${id}`;

/** Native share sheet where it exists (phones), otherwise copies the link. Returns what happened. */
export async function shareHome(locale: string, id: string, title: string): Promise<"shared" | "copied" | "failed" | "cancelled"> {
  const url = homeLink(locale, id);
  try {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }); return "shared"; } catch (e) { if ((e as Error).name === "AbortError") return "cancelled"; }
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    // clipboard blocked (e.g. insecure page): fall back to a temporary text field
    try {
      const ta = document.createElement("textarea");
      ta.value = url; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok ? "copied" : "failed";
    } catch { return "failed"; }
  }
}

/** Google Maps links built from coordinates (no API key needed for the embed or the deep link). */
export const mapEmbed = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
export const mapOpen = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
