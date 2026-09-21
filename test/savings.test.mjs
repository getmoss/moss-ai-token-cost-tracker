import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weeklyTotalsFromDaily,
  currentWeek,
  baselineMean,
  detectSpike,
  detectSustainedGrowth,
  costPerRequestWeeks,
  matchLifecycleEvents,
  blendedRate,
  modelListPriceCost,
  summarizeAlerts,
  detectHigherCostModelPattern,
  computeAlerts,
} from "../lib/savings.mjs";

test("weeklyTotalsFromDaily: chunks a daily series into weekly sums, oldest first", () => {
  const daily = [
    ...Array(7).fill(10), // week 1 = 70
    ...Array(7).fill(20), // week 2 = 140
  ];
  assert.deepEqual(weeklyTotalsFromDaily(daily), [70, 140]);
});

test("weeklyTotalsFromDaily: throws on a length that isn't a multiple of 7", () => {
  assert.throws(() => weeklyTotalsFromDaily(Array(10).fill(1)));
});

test("currentWeek: returns the last entry", () => {
  assert.equal(currentWeek([100, 200, 300]), 300);
});

test("currentWeek: 0 for an empty series rather than throwing", () => {
  assert.equal(currentWeek([]), 0);
});

test("baselineMean: averages every entry except the last (current) week", () => {
  assert.equal(baselineMean([100, 200, 300, 400]), 200);
});

test("baselineMean: null when there's no prior week to compare against", () => {
  assert.equal(baselineMean([300]), null);
  assert.equal(baselineMean([]), null);
});

test("detectSpike: triggers when delta clears both the $ and % thresholds and the baseline sample is large enough", () => {
  const weeks = [100, 100, 100, 200]; // expected 100, current 200 -> +100%, +$100
  const result = detectSpike(weeks, {
    minDelta: 50,
    minChangePct: 30,
    minBaselineTotal: 100,
  });
  assert.equal(result.triggered, true);
  assert.equal(result.expected, 100);
  assert.equal(result.delta, 100);
  assert.equal(result.changePct, 100);
});

test("detectSpike: does not trigger when the % change is below minChangePct", () => {
  const weeks = [100, 100, 100, 110]; // +10%
  const result = detectSpike(weeks, { minDelta: 5, minChangePct: 30 });
  assert.equal(result.triggered, false);
});

test("detectSpike: does not trigger when the $ delta is below minDelta even if % clears", () => {
  const weeks = [1, 1, 1, 2]; // +100% but only +$1
  const result = detectSpike(weeks, { minDelta: 50, minChangePct: 30 });
  assert.equal(result.triggered, false);
});

test("detectSpike: does not trigger when the baseline sample is too small (minBaselineTotal)", () => {
  const weeks = [1, 1, 1, 100]; // huge % and $ jump, but baseline is nearly zero activity
  const result = detectSpike(weeks, {
    minDelta: 10,
    minChangePct: 10,
    minBaselineTotal: 100,
  });
  assert.equal(result.triggered, false);
});

test("detectSpike: not triggered (and no crash) when there's no baseline at all", () => {
  const result = detectSpike([50]);
  assert.equal(result.triggered, false);
  assert.equal(result.expected, null);
});

test("detectSpike: a zero baseline with positive current spend is treated as an infinite % change", () => {
  const result = detectSpike([0, 0, 0, 50], { minDelta: 10, minChangePct: 10 });
  assert.equal(result.changePct, Infinity);
  assert.equal(result.triggered, true);
});

test("detectSustainedGrowth: true for a strictly increasing run of the required length", () => {
  assert.equal(detectSustainedGrowth([50, 100, 150, 200], 3), true);
});

test("detectSustainedGrowth: false when any step in the trailing window decreases", () => {
  assert.equal(detectSustainedGrowth([50, 200, 150, 200], 3), false);
});

test("detectSustainedGrowth: false for a perfectly flat series (non-decreasing but no real increase)", () => {
  assert.equal(detectSustainedGrowth([100, 100, 100], 3), false);
});

test("detectSustainedGrowth: false when there aren't enough weeks of history yet", () => {
  assert.equal(detectSustainedGrowth([100, 200], 3), false);
});

test("costPerRequestWeeks: divides spend by requests week-by-week", () => {
  assert.deepEqual(costPerRequestWeeks([100, 200], [50, 100]), [2, 2]);
});

test("costPerRequestWeeks: null for a week with zero requests rather than Infinity/NaN", () => {
  assert.deepEqual(costPerRequestWeeks([100], [0]), [null]);
});

test("matchLifecycleEvents: keeps only events whose modelIds intersect actual usage, annotated with affected spend", () => {
  const events = [
    { id: "a", modelIds: ["claude-opus-4-1"] },
    { id: "b", modelIds: ["claude-fable-5"] },
  ];
  const usage = new Map([["claude-opus-4-1", 640]]);
  const result = matchLifecycleEvents(events, usage);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
  assert.deepEqual(result[0].affectedModelIds, ["claude-opus-4-1"]);
  assert.equal(result[0].currentWeeklySpend, 640);
});

test("matchLifecycleEvents: sums spend across multiple affected models on one event", () => {
  const events = [{ id: "a", modelIds: ["m1", "m2"] }];
  const usage = new Map([
    ["m1", 100],
    ["m2", 50],
  ]);
  assert.equal(matchLifecycleEvents(events, usage)[0].currentWeeklySpend, 150);
});

test("blendedRate: company rate reflects the actual (discounted) cost, provider rate reflects the hypothetical undiscounted cost", () => {
  const result = blendedRate({
    actualInputCost: 80,
    hypotheticalInputCost: 100,
    outputCost: 20,
    totalInputTokens: 900_000,
    outputTokens: 100_000,
  });
  // (80 + 20) / 1_000_000 * 1e6 = 100 ; (100 + 20) / 1_000_000 * 1e6 = 120
  assert.equal(result.companyRate, 100);
  assert.equal(result.providerRate, 120);
});

test("blendedRate: null rates rather than divide-by-zero when there are no tokens at all", () => {
  const result = blendedRate({
    actualInputCost: 0,
    hypotheticalInputCost: 0,
    outputCost: 0,
    totalInputTokens: 0,
    outputTokens: 0,
  });
  assert.equal(result.companyRate, null);
  assert.equal(result.providerRate, null);
});

test("blendedRate: provider rate is null when there's no hypothetical cost to compare (e.g. no uncached traffic to derive a rate from)", () => {
  const result = blendedRate({
    actualInputCost: 10,
    hypotheticalInputCost: null,
    outputCost: 5,
    totalInputTokens: 1000,
    outputTokens: 100,
  });
  assert.equal(result.providerRate, null);
  assert.notEqual(result.companyRate, null);
});

test("modelListPriceCost: sums each token type at its own rate, per 1M tokens", () => {
  const pricing = { input: 2, cached: 0.2, output: 10 };
  const cost = modelListPriceCost(pricing, {
    uncachedInputTokens: 1_000_000,
    cacheReadInputTokens: 1_000_000,
    cacheCreationTokens: 0,
    outputTokens: 1_000_000,
  });
  // 1M * $2 + 1M * $0.2 + 1M * $10, each /1e6 -> 2 + 0.2 + 10
  assert.equal(cost, 12.2);
});

test("modelListPriceCost: missing usage fields default to 0 rather than throwing", () => {
  const pricing = { input: 2, cached: 0.2, output: 10 };
  assert.equal(modelListPriceCost(pricing, {}), 0);
});

test("summarizeAlerts: totals only alerts with a positive $ impact, counts every alert", () => {
  const alerts = [
    { category: "people", impactUsd: 100 },
    { category: "workflow", impactUsd: 50 },
    { category: "model", impactUsd: null }, // e.g. a request-burst-only alert
  ];
  const result = summarizeAlerts(alerts);
  assert.equal(result.totalAboveExpected, 150);
  assert.equal(result.caseCount, 3);
});

test("detectHigherCostModelPattern: flags an above-median-price model gaining spend share from a cheaper one", () => {
  const models = [
    { id: "expensive", avgPricePerMillion: 30, spendWeeks: [100, 100, 100, 250] },
    { id: "cheap", avgPricePerMillion: 5, spendWeeks: [200, 200, 200, 100] },
  ];
  const result = detectHigherCostModelPattern(models, { minShareChangePct: 5 });
  assert.ok(result);
  assert.equal(result.id, "expensive");
  assert.ok(result.shareDelta > 5);
});

test("detectHigherCostModelPattern: null when no above-median model gains meaningful share", () => {
  const models = [
    { id: "a", avgPricePerMillion: 10, spendWeeks: [100, 100, 100, 101] },
    { id: "b", avgPricePerMillion: 10, spendWeeks: [100, 100, 100, 99] },
  ];
  assert.equal(detectHigherCostModelPattern(models, { minShareChangePct: 5 }), null);
});

test("detectHigherCostModelPattern: null (not a divide-by-zero crash) when there's no baseline or current spend at all", () => {
  const models = [{ id: "a", avgPricePerMillion: 10, spendWeeks: [0, 0, 0, 0] }];
  assert.equal(detectHigherCostModelPattern(models), null);
});

test("computeAlerts: a person spend spike triggers a 'people' category alert with the raw $ delta as impact", () => {
  const entities = [
    {
      kind: "person",
      id: "maya",
      name: "Maya",
      spendWeeks: [100, 100, 100, 300],
      requestWeeks: [200, 200, 200, 200],
    },
  ];
  const alerts = computeAlerts(entities, {
    minChangePct: 30,
    minDeltaUsd: 50,
    requestFloor: 100,
    trendWeeks: 3,
  });
  const spike = alerts.find((a) => a.type === "personalSpendSpike");
  assert.ok(spike);
  assert.equal(spike.category, "people");
  assert.equal(spike.impactUsd, 200);
});

test("computeAlerts: skips an entity whose baseline requests don't clear requestFloor", () => {
  const entities = [
    {
      kind: "person",
      id: "tiny",
      name: "Tiny",
      spendWeeks: [10, 10, 10, 100],
      requestWeeks: [1, 1, 1, 1],
    },
  ];
  const alerts = computeAlerts(entities, {
    minChangePct: 10,
    minDeltaUsd: 5,
    requestFloor: 100,
  });
  assert.equal(alerts.length, 0);
});

test("computeAlerts: a workflow can trigger multiple distinct alert types at once (spend spike + request burst)", () => {
  const entities = [
    {
      kind: "workflow",
      id: "migration-agent",
      name: "Migration Agent",
      spendWeeks: [100, 100, 100, 300],
      requestWeeks: [100, 100, 100, 300],
    },
  ];
  const alerts = computeAlerts(entities, {
    minChangePct: 30,
    minDeltaUsd: 50,
    requestFloor: 50,
  });
  const types = alerts.map((a) => a.type);
  assert.ok(types.includes("workflowSpendSpike"));
  assert.ok(types.includes("requestBurst"));
  assert.ok(alerts.every((a) => a.category === "workflow"));
});

test("computeAlerts: costPerRequestJump does NOT trigger on a big % rate swing alone — the implied $ impact (rate delta × current volume) must also clear minDeltaUsd", () => {
  const entities = [
    {
      kind: "person",
      id: "tiny-rate",
      name: "Tiny Rate",
      spendWeeks: [1, 1, 1, 2], // $/request: 0.1 -> 0.2, a 100% jump...
      requestWeeks: [10, 10, 10, 10], // ...but only 10 requests, so it's worth $1 total
    },
  ];
  const alerts = computeAlerts(entities, {
    minChangePct: 30,
    minDeltaUsd: 50,
    requestFloor: 0,
  });
  assert.equal(alerts.length, 0);
});

test("computeAlerts: costPerRequestJump triggers once the implied $ impact clears minDeltaUsd, and reports that implied impact (not the entity's total spend delta) as impactUsd", () => {
  const entities = [
    {
      kind: "person",
      id: "big-rate",
      name: "Big Rate",
      spendWeeks: [100, 100, 100, 200], // $/request: 0.1 -> 0.2, at 1000 requests/week
      requestWeeks: [1000, 1000, 1000, 1000],
    },
  ];
  const alerts = computeAlerts(entities, {
    minChangePct: 30,
    minDeltaUsd: 50,
    requestFloor: 0,
  });
  const jump = alerts.find((a) => a.type === "costPerRequestJump");
  assert.ok(jump);
  // (0.2 - 0.1) * 1000 requests = $100 implied impact (within floating-point tolerance)
  assert.ok(Math.abs(jump.impactUsd - 100) < 1e-6);
});

test("computeAlerts: 'Spend rising week after week' fires for a workflow with a sustained upward trend even without a single-week spike", () => {
  const entities = [
    {
      kind: "workflow",
      id: "steady-climb",
      name: "Steady Climb",
      spendWeeks: [100, 130, 160, 190],
      requestWeeks: [500, 500, 500, 500],
    },
  ];
  const alerts = computeAlerts(entities, {
    minChangePct: 1000, // deliberately unreachable, so only the trend check can fire
    minDeltaUsd: 1000,
    requestFloor: 100,
    trendWeeks: 3,
  });
  assert.ok(alerts.some((a) => a.type === "sustainedGrowth"));
});

test("summarizeAlerts: picks the single largest-impact alert per category, capped at 3", () => {
  const alerts = [
    { category: "people", impactUsd: 100, id: "small-person" },
    { category: "people", impactUsd: 300, id: "big-person" },
    { category: "workflow", impactUsd: 200, id: "workflow" },
    { category: "model", impactUsd: 50, id: "model" },
  ];
  const drivers = summarizeAlerts(alerts).topDrivers;
  assert.equal(drivers.length, 3);
  assert.ok(drivers.some((d) => d.id === "big-person"));
  assert.ok(!drivers.some((d) => d.id === "small-person"));
});
