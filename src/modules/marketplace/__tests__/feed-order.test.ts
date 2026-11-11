import { describe, expect, it } from "vitest";
import { feedOrder, type FeedSort } from "../feed-order";

const SORTS: FeedSort[] = ["newest", "price_asc", "price_desc", "popularity", "area_desc"];

describe("feed order: featured listings first", () => {
  it("every sort puts the featured flag first", () => {
    for (const s of SORTS) expect(feedOrder(s)[0]).toEqual({ isFeatured: "desc" });
  });
  it("the chosen sort only orders inside each group, and the id is the last tie-break", () => {
    expect(feedOrder("price_asc")).toEqual([{ isFeatured: "desc" }, { price: "asc" }, { id: "desc" }]);
    expect(feedOrder("price_desc")).toEqual([{ isFeatured: "desc" }, { price: "desc" }, { id: "desc" }]);
    expect(feedOrder("newest")).toEqual([{ isFeatured: "desc" }, { id: "desc" }]);
    for (const s of SORTS) expect(feedOrder(s).at(-1)).toEqual({ id: "desc" });
  });
});
