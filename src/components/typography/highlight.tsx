import type { ReactNode } from "react";

/**
 * Heading rule (docs/design-system.md §B): the sentence stays in Poppins (Anek Bangla in Bangla);
 * only the ONE meaningful word/phrase is wrapped in <hl>…</hl> in messages/*.json and gets Playfair Italic + brand gradient.
 *   t.rich("title", { hl })
 */
export const hl = (chunks: ReactNode) => <span className="gradient-heading">{chunks}</span>;
