import { describe, it, expect } from "vitest";
import { DATA } from "@/lib/data";

describe("fixed time holdout shipped with the app", () => {
  it("train and holdout years are disjoint and as documented", () => {
    expect(DATA.split.yield_train).toEqual([1997, 2016]); expect(DATA.split.yield_holdout).toEqual([2017, 2024]);
    expect(DATA.split.price_train).toEqual([2002, 2019]); expect(DATA.split.price_holdout).toEqual([2020, 2024]);
    expect(DATA.split.yield_inner_folds[1]).toBeLessThan(DATA.split.yield_holdout[0]);
    expect(DATA.split.price_inner_folds[1]).toBeLessThan(DATA.split.price_holdout[0]);
  });
  it("holdout tables cover 18 crop-seasons plus ALL, and 8 / 5 years", () => {
    expect(DATA.holdout.yield.length).toBe(19); expect(DATA.holdout.price.length).toBe(19);
    expect(DATA.holdout.yield_by_year.map((r) => r.year)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]);
    expect(DATA.holdout.price_by_year.map((r) => r.year)).toEqual([2020, 2021, 2022, 2023, 2024]);
  });
  it("live model is retrained on all years", () => {
    expect(DATA.live_model.yield_data_years).toEqual([1997, 2024]); expect(DATA.live_model.yield_fit_years[1]).toBe(2024); expect(DATA.live_model.price_fit_years).toEqual([2002, 2024]);
  });
  it("deployed methods are the ones chosen on training years (not the holdout winner)", () => {
    for (const r of DATA.metrics.yield) if (r.crop !== "ALL") expect(DATA.meta.yield_method[`${r.crop}|${r.season}`]).toBe(r.best);
  });
});
