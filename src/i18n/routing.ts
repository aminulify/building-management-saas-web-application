import { defineRouting } from "next-intl/routing";

/** Locale lives in the URL (/bn, /en); Bangla is the default (architecture 11.2). */
export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
});

export type Locale = (typeof routing.locales)[number];
