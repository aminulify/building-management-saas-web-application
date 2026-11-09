import { notFound } from "next/navigation";

/** Any unknown path under /bn or /en renders the branded, translated [locale]/not-found.tsx. */
export default function CatchAll() {
  notFound();
}
