/** View More / View Less arithmetic of the Government All Properties table (no React here, so it is easy to test). */
export const FIRST_PAGE = 9;
export const STEP = 10;

/** Rows shown after "View More": 10 more, never more than exist. */
export const moreVisible = (visible: number, loaded: number) => Math.min(visible + STEP, loaded);

/** Rows shown after "View Less": 10 fewer, never fewer than the first 9. */
export const lessVisible = (visible: number) => Math.max(FIRST_PAGE, visible - STEP);

/** The button says "View More" until the end of the list is on screen, then "View Less" until only the first 9 remain. */
export function buttonFor(visible: number, loaded: number, hasMore: boolean, mode: "more" | "less"): "more" | "less" | null {
  if (mode === "more") return visible < loaded || hasMore ? "more" : null;
  return visible > FIRST_PAGE ? "less" : null;
}
