import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weeklyGrowthRate,
  linearWeeklyRate,
  convertWeeklyRate,
  projectCompounding,
  projectLinear,
  computeScenarioFactors,
  sixMonthMonthlyCost,
  currentPremiumModelShare,
  planningPeriodConfig,
  chunkWeeklyTotals,
  chunkWeeklySnapshots,
  weeklySnapshotsFromDaily,
  clampHistoricReference,
} from "../lib/planning.mjs";

test("weeklyGrowthRate: median week-over-week ratio — a steady trend matches plain endpoint CAGR", () => {
  // a perfectly steady +10%/week trend: median of the individual steps equals the old
  // first-vs-last formula exactly, since every step agrees.
  const rate = weeklyGrowthRate([100, 110, 121]);
  assert.ok(Math.abs(rate - 0.1) < 1e-9);
});

test("weeklyGrowthRate: a single volatile week doesn't dominate the rate", () => {
  // steady ~5%/week for 4 steps, then one anomalous 10x week. Endpoint CAGR on this series
  // reports ~78%/week (exactly the kind of one-bad-week blowup that made a $62k spend forecast
  // $605k six months out); the median of the individual steps stays close to the real trend.
  const rate = weeklyGrowthRate([100, 105, 110, 115, 1150]);
  assert.ok(rate < 0.06, `expected the spike to be outvoted, got ${rate}`);
});

test("weeklyGrowthRate: null with fewer than 2 weeks", () => {
  assert.equal(weeklyGrowthRate([100]), null);
  assert.equal(weeklyGrowthRate([]), null);
});

test("weeklyGrowthRate: null only when no step has a valid positive base", () => {
  assert.equal(weeklyGrowthRate([0, 50]), null);
  assert.equal(weeklyGrowthRate([-10, 50]), null);
});

test("weeklyGrowthRate: a leading zero/negative week no longer nulls out an otherwise-valid trend", () => {
  // e.g. week 0 spend is $0 (before the org used AI at all) — the remaining steps still have a
  // real, computable trend, so this returns it instead of bailing out on the first week alone.
  const rate = weeklyGrowthRate([0, 100, 110]);
  assert.ok(Math.abs(rate - 0.1) < 1e-9);
});

test("linearWeeklyRate: additive pp-per-week change", () => {
  assert.equal(linearWeeklyRate([50, 55, 60]), 5);
});

test("linearWeeklyRate: a single volatile week doesn't dominate the rate", () => {
  // steady +2pp/week for 3 steps, then a +34pp jump. (last - first) / (n-1) would report 10pp/wk;
  // the median of the individual steps stays at the real, steady 2pp/week.
  const rate = linearWeeklyRate([50, 52, 54, 56, 90]);
  assert.equal(rate, 2);
});

test("linearWeeklyRate: null with fewer than 2 weeks", () => {
  assert.equal(linearWeeklyRate([50]), null);
});

test("convertWeeklyRate: day and month conversions round-trip a weekly compounding rate", () => {
  const weekly = 0.07;
  const daily = convertWeeklyRate(weekly, "day");
  // Compounding the daily rate 7 times should recover the weekly rate.
  assert.ok(Math.abs(Math.pow(1 + daily, 7) - (1 + weekly)) < 1e-9);
  assert.equal(convertWeeklyRate(weekly, "week"), weekly);
  const monthly = convertWeeklyRate(weekly, "month");
  assert.ok(monthly > weekly); // a month is more weeks than a week
});

test("projectCompounding: grows a starting value forward, inclusive of the start", () => {
  const values = projectCompounding(100, 0.1, 3);
  assert.equal(values.length, 4);
  assert.equal(values[0], 100);
  assert.ok(Math.abs(values[3] - 133.1) < 1e-9);
});

test("projectCompounding: flat forecast when the rate is 0", () => {
  assert.deepEqual(projectCompounding(50, 0, 3), [50, 50, 50, 50]);
});

test("projectLinear: adds the rate each step and clamps to the given bounds", () => {
  const values = projectLinear(95, 3, 4, { min: 0, max: 100 });
  assert.deepEqual(values, [95, 98, 100, 100, 100]);
});

test("projectLinear: clamps at the floor too", () => {
  const values = projectLinear(5, -3, 3, { min: 0, max: 100 });
  assert.deepEqual(values, [5, 2, 0, 0]);
});

test("computeScenarioFactors: identical to defaults yields factor 1", () => {
  const defaults = { adoption: 60, usage: 1600, tokens: 3800, price: 100, providerPrice: 100, mix: 30 };
  const { spendFactor, usageFactor } = computeScenarioFactors(defaults, defaults);
  assert.ok(Math.abs(spendFactor - 1) < 1e-9);
  assert.ok(Math.abs(usageFactor - 1) < 1e-9);
});

test("computeScenarioFactors: doubling adoption doubles both factors", () => {
  const defaults = { adoption: 50, usage: 1000, tokens: 3000, price: 100, providerPrice: 100, mix: 30 };
  const values = { ...defaults, adoption: 100 };
  const { spendFactor, usageFactor } = computeScenarioFactors(values, defaults);
  assert.ok(Math.abs(spendFactor - 2) < 1e-9);
  assert.ok(Math.abs(usageFactor - 2) < 1e-9);
});

test("computeScenarioFactors: doubling employees doubles spend/usage but leaves adoption factor unchanged", () => {
  const defaults = { adoption: 50, usage: 1000, tokens: 3000, price: 100, providerPrice: 100, mix: 30, employees: 100 };
  const values = { ...defaults, employees: 200 };
  const { spendFactor, usageFactor, adoptionFactor } = computeScenarioFactors(values, defaults);
  assert.ok(Math.abs(spendFactor - 2) < 1e-9);
  assert.ok(Math.abs(usageFactor - 2) < 1e-9);
  assert.ok(Math.abs(adoptionFactor - 1) < 1e-9);
});

test("computeScenarioFactors: model mix shift applies an 0.8%-per-point spend multiplier", () => {
  const defaults = { adoption: 50, usage: 1000, tokens: 3000, price: 100, providerPrice: 100, mix: 30 };
  const values = { ...defaults, mix: 40 }; // +10 points
  const { spendFactor } = computeScenarioFactors(values, defaults);
  assert.ok(Math.abs(spendFactor - 1.08) < 1e-9);
});

test("computeScenarioFactors: a zero/missing default is guarded against (no Infinity/NaN)", () => {
  const defaults = { adoption: 0, usage: 1000, tokens: 3000, price: 100, providerPrice: 100, mix: 30 };
  const values = { ...defaults, adoption: 0 };
  const { spendFactor, usageFactor } = computeScenarioFactors(values, defaults);
  assert.ok(Number.isFinite(spendFactor));
  assert.ok(Number.isFinite(usageFactor));
});

test("sixMonthMonthlyCost: baseline projects the current weekly spend forward 26 weeks and converts to monthly", () => {
  const result = sixMonthMonthlyCost(1000, 0, 1);
  // 0% growth -> 6-month weekly spend unchanged -> monthly = weekly * 4.33
  assert.ok(Math.abs(result.baselineMonthly - 4330) < 1e-6);
  assert.ok(Math.abs(result.baselineWeeklyGrowthPct - 0) < 1e-6);
});

test("sixMonthMonthlyCost: scenario factor scales the 6-month projection and its implied growth", () => {
  const result = sixMonthMonthlyCost(1000, 0.01, 1.5);
  assert.ok(Math.abs(result.scenarioMonthly - result.baselineMonthly * 1.5) < 1e-6);
  assert.ok(result.scenarioWeeklyGrowthPct > result.baselineWeeklyGrowthPct);
});

test("currentPremiumModelShare: only above-median-priced models count toward the share", () => {
  const models = [
    { avgPricePerMillion: 1, spend: 100 },
    { avgPricePerMillion: 5, spend: 100 },
    { avgPricePerMillion: 10, spend: 200 },
  ];
  // median price = 5; only the 10/million model (spend 200) is strictly above it
  const share = currentPremiumModelShare(models);
  assert.ok(Math.abs(share - 50) < 1e-9); // 200 / 400 total
});

test("currentPremiumModelShare: falls back to 50 with fewer than 2 models or no spend", () => {
  assert.equal(currentPremiumModelShare([]), 50);
  assert.equal(currentPremiumModelShare([{ avgPricePerMillion: 5, spend: 0 }]), 50);
});

test("planningPeriodConfig: fixed presets for 1 week / 4 weeks / 6 months", () => {
  assert.deepEqual(planningPeriodConfig("1w", null, "2026-09-21"), {
    future: 7,
    unit: "day",
    futureLabel: "next 1 week",
  });
  assert.equal(planningPeriodConfig("4w", null, "2026-09-21").unit, "week");
  assert.equal(planningPeriodConfig("6m", null, "2026-09-21").unit, "month");
});

test("planningPeriodConfig: no longer decides `history` — that's the Historic reference dropdown's job now", () => {
  assert.equal("history" in planningPeriodConfig("1w", null, "2026-09-21"), false);
  assert.equal("history" in planningPeriodConfig("4w", null, "2026-09-21"), false);
  assert.equal("history" in planningPeriodConfig("6m", null, "2026-09-21"), false);
});

test("planningPeriodConfig: custom date under 12 weeks away resolves to a week-unit window", () => {
  const config = planningPeriodConfig("custom", "2026-10-05", "2026-09-21"); // 14 days
  assert.equal(config.unit, "week");
  assert.equal(config.future, 2);
  assert.equal(config.futureLabel, "next 2 weeks");
});

test("planningPeriodConfig: custom date far away resolves to a month-unit window, capped at 12", () => {
  const config = planningPeriodConfig("custom", "2028-09-21", "2026-09-21"); // 2 years away
  assert.equal(config.unit, "month");
  assert.equal(config.future, 12);
  assert.equal(config.futureLabel, "next 12 months");
});

test("chunkWeeklyTotals: sums each 4-week chunk into a monthly total, oldest first", () => {
  const weekly = [...Array(4).fill(10), ...Array(4).fill(20)];
  assert.deepEqual(chunkWeeklyTotals(weekly), [40, 80]);
});

test("chunkWeeklyTotals: throws on a length that isn't a multiple of the chunk size", () => {
  assert.throws(() => chunkWeeklyTotals(Array(5).fill(1)));
});

test("chunkWeeklySnapshots: keeps the last value of each chunk instead of summing", () => {
  const weekly = [50, 52, 54, 56, 58, 60, 62, 64];
  assert.deepEqual(chunkWeeklySnapshots(weekly), [56, 64]);
});

test("weeklySnapshotsFromDaily: keeps the value on the last day of each 7-day chunk", () => {
  const daily = [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17];
  assert.deepEqual(weeklySnapshotsFromDaily(daily), [7, 17]);
});

test("weeklySnapshotsFromDaily: throws on a length that isn't a multiple of 7", () => {
  assert.throws(() => weeklySnapshotsFromDaily(Array(10).fill(1)));
});

test("clampHistoricReference: passes the request through when there's enough history", () => {
  assert.deepEqual(clampHistoricReference(4, 12), { weeks: 4, warning: null });
});

test("clampHistoricReference: clamps to what's available and warns", () => {
  const result = clampHistoricReference(12, 3);
  assert.equal(result.weeks, 3);
  assert.match(result.warning, /3 complete weeks/);
});

test("clampHistoricReference: warns distinctly when there isn't even a trend to show", () => {
  const result = clampHistoricReference(4, 1);
  assert.equal(result.weeks, 1);
  assert.match(result.warning, /Not enough history/);
});
