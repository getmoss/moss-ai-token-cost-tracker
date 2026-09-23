// Pure, DOM/fetch-free forecasting helpers for the Planning section
// (index.html's `#planningCard`) — unit-testable with node --test the same
// way lib/savings.mjs is (see test/planning.test.mjs). Callers are
// responsible for fetching whatever /api/* data they need and reducing it
// to the plain weekly series / current-period snapshots these functions
// expect — nothing here does network or DOM I/O.

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Compounding week-over-week growth rate from a weekly series (oldest
// first), used for the Spend and Usage forecasts. Median (not endpoint
// CAGR, and not a mean — a mean of week-over-week ratios still telescopes
// back to first-vs-last) of the individual week-over-week ratios, so one
// volatile week — a spike, a data glitch, a one-off burst — can't single-
// handedly set the entire 6-month compounding forecast the way comparing
// only the window's first and last week used to (a $62k -> $605k six-month
// projection turned out to be exactly one noisy pair of weeks, compounded
// for 26 weeks). Returns null when there's no real signal to compute from
// (fewer than 2 weeks, or every step has a zero/negative starting value) —
// same "don't fake a baseline off nothing" convention as lib/savings.mjs's
// baselineMean().
export function weeklyGrowthRate(weeklyValues) {
  const n = weeklyValues.length;
  if (n < 2) return null;
  const stepRates = [];
  for (let i = 1; i < n; i++) {
    if (weeklyValues[i - 1] > 0) stepRates.push(weeklyValues[i] / weeklyValues[i - 1] - 1);
  }
  return stepRates.length ? median(stepRates) : null;
}

// Additive percentage-point-per-week rate, used for Adoption — a
// percentage's own "growth" reads as a pp change, not a compounding ratio
// (mirrors the mockup's own split: Spend/Usage compound, Adoption moves
// linearly and gets clamped to [0,100] by projectLinear below). Median of
// the individual week-over-week deltas rather than (last - first) / (n-1)
// — unlike the ratio case above, a mean of additive deltas telescopes
// exactly back to that same first-vs-last formula, so only the median
// actually gains any resistance to a single anomalous week.
export function linearWeeklyRate(weeklyValues) {
  const n = weeklyValues.length;
  if (n < 2) return null;
  const deltas = [];
  for (let i = 1; i < n; i++) deltas.push(weeklyValues[i] - weeklyValues[i - 1]);
  return median(deltas);
}

// Converts a per-week compounding rate to the equivalent per-day/-week/
// -month rate — a horizon rendered in daily or monthly steps still needs
// the same underlying weekly trend, just expressed per output step.
export function convertWeeklyRate(weeklyRate, unit) {
  if (unit === "day") return Math.pow(1 + weeklyRate, 1 / 7) - 1;
  if (unit === "month") return Math.pow(1 + weeklyRate, 4.345) - 1; // ~365.25 / 12 / 7
  return weeklyRate;
}

// Projects a compounding series forward `periods` steps from `startValue`
// (inclusive of the start, so length periods+1) — used for Spend/Usage.
export function projectCompounding(startValue, ratePerPeriod, periods) {
  const values = [startValue];
  for (let i = 1; i <= periods; i++) {
    values.push(values[i - 1] * (1 + ratePerPeriod));
  }
  return values;
}

// Projects a linear (additive) series forward, clamped to [min, max] at
// every step — used for Adoption, which can't compound past 100% (or
// below 0%) the way a dollar or request count can keep growing.
export function projectLinear(
  startValue,
  ratePerPeriod,
  periods,
  { min = -Infinity, max = Infinity } = {},
) {
  const values = [startValue];
  for (let i = 1; i <= periods; i++) {
    const next = values[i - 1] + ratePerPeriod;
    values.push(Math.min(max, Math.max(min, next)));
  }
  return values;
}

// Ratio of a slider's current position to its live-data baseline — guards
// a zero/undefined baseline (e.g. no seat data) so a slider can't produce
// Infinity/NaN and silently break the whole scenario factor.
const safeRatio = (value, base) => (base > 0 ? value / base : 1);

// "How far are these seven slider positions from doing nothing" — mirrors
// the mockup's own planningFactors(): employees, adoption, usage, tokens and
// a 70/30 blend of company/provider token price each scale spend
// proportionally to their ratio vs baseline; model mix applies an assumed
// 0.8% spend change per percentage-point shift toward higher-cost models.
// `defaults` is the "no adjustment" center point for every slider — always
// seeded from real current-period data by the caller (see
// buildPlanningDefaults() in index.html), never hardcoded here. `employees`
// (current active AI users, expected to grow with headcount) and `adoption`
// both scale total request volume, since total users = employees ×
// adoption% — so both fold into usageFactor/spendFactor, but neither alone
// is `adoptionFactor`, which stays just the adoption ratio: the chart's
// Adoption line is a %, independent of headcount level.
export function computeScenarioFactors(values, defaults) {
  const employees = safeRatio(values.employees, defaults.employees);
  const adoption = safeRatio(values.adoption, defaults.adoption);
  const usage = safeRatio(values.usage, defaults.usage);
  const tokens = safeRatio(values.tokens, defaults.tokens);
  const companyPrice = safeRatio(values.price, defaults.price);
  const providerPrice = safeRatio(values.providerPrice, defaults.providerPrice);
  const price = companyPrice * 0.7 + providerPrice * 0.3;
  const modelMix = 1 + (values.mix - defaults.mix) * 0.008;
  return {
    spendFactor: employees * adoption * usage * tokens * price * modelMix,
    usageFactor: employees * adoption * usage,
    adoptionFactor: adoption,
  };
}

// "Projected monthly AI cost six months from now" KPI — deliberately
// independent of the chart's horizon toolbar, always a fixed 26-week/
// 6-month projection driven only by the Historic-reference growth rate.
// The "implied weekly growth" figures are back-derived from the 6-month
// totals (rather than just echoing weeklyRate) so the scenario side stays
// consistent with `scenarioFactor` being a single one-time multiplier on
// the whole 6-month baseline, not itself a per-week rate.
export function sixMonthMonthlyCost(currentWeeklySpend, weeklyRate, scenarioFactor = 1) {
  const weeksAhead = 26;
  const weeksPerMonth = 4.33;
  const baselineWeeklyIn6Months = currentWeeklySpend * Math.pow(1 + weeklyRate, weeksAhead);
  const scenarioWeeklyIn6Months = baselineWeeklyIn6Months * scenarioFactor;
  const impliedRate = (weeklyValue) =>
    currentWeeklySpend > 0
      ? (Math.pow(weeklyValue / currentWeeklySpend, 1 / weeksAhead) - 1) * 100
      : 0;
  return {
    baselineMonthly: baselineWeeklyIn6Months * weeksPerMonth,
    scenarioMonthly: scenarioWeeklyIn6Months * weeksPerMonth,
    baselineWeeklyGrowthPct: impliedRate(baselineWeeklyIn6Months),
    scenarioWeeklyGrowthPct: impliedRate(scenarioWeeklyIn6Months),
  };
}

// Current-week snapshot of "what % of spend sits on above-(price-)median
// models" — seeds the Higher-cost model share slider's baseline. Adapts
// detectHigherCostModelPattern's median-price logic from lib/savings.mjs,
// but as a single snapshot rather than a week-over-week share *change*
// (Planning needs a starting point for a slider, not a spike to flag).
export function currentPremiumModelShare(models) {
  const totalSpend = models.reduce((sum, m) => sum + m.spend, 0);
  if (totalSpend <= 0 || models.length < 2) return 50; // no meaningful median to compare against
  const medianPrice = median(models.map((m) => m.avgPricePerMillion));
  const premiumSpend = models
    .filter((m) => m.avgPricePerMillion > medianPrice)
    .reduce((sum, m) => sum + m.spend, 0);
  return (premiumSpend / totalSpend) * 100;
}

// Maps the horizon toolbar selection to a {future, unit} window — same
// granularity choice as the mockup's own planningPeriodConfig, but with
// `today` passed in explicitly (never read from Date.now()) so this stays
// a pure, directly testable function. Deliberately doesn't decide `history`
// any more (it used to, symmetric with `future`) — how much past data gets
// plotted is the Historic reference dropdown's job now, not the Future
// horizon's, so a user picking "1 year" of history actually sees a year on
// the chart instead of it always matching whatever forward window they
// picked. `futureLabel` is just the forward half of the chart title; the
// caller (index.html's renderPlanningChart) prefixes it with the Historic
// reference dropdown's own label to build the full "Last X and next Y".
export function planningPeriodConfig(horizon, customDate, today) {
  if (horizon === "1w") return { future: 7, unit: "day", futureLabel: "next 1 week" };
  if (horizon === "4w") return { future: 4, unit: "week", futureLabel: "next 4 weeks" };
  if (horizon === "6m") return { future: 6, unit: "month", futureLabel: "next 6 months" };

  const target = new Date(`${customDate}T00:00:00`);
  const start = new Date(`${today}T00:00:00`);
  const days = Math.max(7, Math.ceil((target - start) / 86400000));
  if (days <= 84) {
    const weeks = Math.max(1, Math.ceil(days / 7));
    return { future: weeks, unit: "week", futureLabel: `next ${weeks} week${weeks === 1 ? "" : "s"}` };
  }
  const months = Math.min(12, Math.max(1, Math.ceil(days / 30.44)));
  return { future: months, unit: "month", futureLabel: `next ${months} month${months === 1 ? "" : "s"}` };
}

// Chunks an already-weekly series (oldest-first, length a multiple of
// `weeksPerChunk`) into coarser totals — builds a real "months of history"
// view for the chart's 6-month/long-custom horizon from the same weekly
// data the Historic reference dropdown (1 month/1 quarter/6 months/1 year) uses. A month is
// treated as a fixed 4 weeks here (not the calendar-accurate ~4.345) to
// keep the chunking exact — a deliberate, documented approximation.
export function chunkWeeklyTotals(weeklyValues, weeksPerChunk = 4) {
  if (weeklyValues.length % weeksPerChunk !== 0) {
    throw new Error(
      `chunkWeeklyTotals: expected a multiple of ${weeksPerChunk} weeks, got ${weeklyValues.length}`,
    );
  }
  const chunks = [];
  for (let i = 0; i < weeklyValues.length; i += weeksPerChunk) {
    chunks.push(weeklyValues.slice(i, i + weeksPerChunk).reduce((sum, v) => sum + v, 0));
  }
  return chunks;
}

// Same chunking as chunkWeeklyTotals, but keeps the LAST value of each
// chunk instead of summing — for a series that's already a rate/snapshot
// (Adoption %), where summing four weekly percentages would be meaningless.
export function chunkWeeklySnapshots(weeklyValues, weeksPerChunk = 4) {
  if (weeklyValues.length % weeksPerChunk !== 0) {
    throw new Error(
      `chunkWeeklySnapshots: expected a multiple of ${weeksPerChunk} weeks, got ${weeklyValues.length}`,
    );
  }
  const chunks = [];
  for (let i = 0; i < weeklyValues.length; i += weeksPerChunk) {
    chunks.push(weeklyValues[i + weeksPerChunk - 1]);
  }
  return chunks;
}

// Day-level counterpart to lib/savings.mjs's weeklyTotalsFromDaily, for a
// series that's already a rate/snapshot (Adoption %) rather than something
// summable — takes the value on the last day of each 7-day chunk instead of
// summing the week.
export function weeklySnapshotsFromDaily(dailyValues) {
  if (dailyValues.length % 7 !== 0) {
    throw new Error(
      `weeklySnapshotsFromDaily: expected a multiple of 7 days, got ${dailyValues.length}`,
    );
  }
  const weeks = [];
  for (let i = 0; i < dailyValues.length; i += 7) {
    weeks.push(dailyValues[i + 6]);
  }
  return weeks;
}

// Clamps the requested "Historic reference" window (1 month/1 quarter/6 months/1 year, i.e.
// 4/13/26/52 weeks) to however many complete weeks the org actually has data for — a brand-new
// org selecting "1 year" should see its real, shorter history rather than an error or
// fabricated padding.
export function clampHistoricReference(requestedWeeks, availableWeeks) {
  if (availableWeeks >= requestedWeeks) return { weeks: requestedWeeks, warning: null };
  const weeks = Math.max(1, availableWeeks);
  return {
    weeks,
    warning:
      weeks < 2
        ? "Not enough history yet to calculate a trend."
        : `Only ${weeks} complete week${weeks === 1 ? "" : "s"} of history available.`,
  };
}
