// Pure, DOM/fetch-free aggregation + alert-detection helpers for the Saving
// opportunities section (index.html's `#savingsCard`) — unit-testable with
// node --test the same way lib/format.mjs is (see test/savings.test.mjs).
// Callers are responsible for fetching whatever /api/* data they need and
// shaping it into the plain "weekly series" arrays these functions expect —
// nothing here does network I/O.

// Chunks a daily series (oldest-first, length must be a multiple of 7) into
// weekly totals, oldest week first. E.g. 35 daily values -> 5 weekly sums.
export function weeklyTotalsFromDaily(dailyValues) {
  if (dailyValues.length % 7 !== 0) {
    throw new Error(
      `weeklyTotalsFromDaily: expected a multiple of 7 days, got ${dailyValues.length}`,
    );
  }
  const weeks = [];
  for (let i = 0; i < dailyValues.length; i += 7) {
    weeks.push(
      dailyValues.slice(i, i + 7).reduce((sum, v) => sum + (v ?? 0), 0),
    );
  }
  return weeks;
}

// `weeks` is always oldest-first with the week under evaluation last — every
// function below shares that one convention so callers never have to guess
// which end is "current".
export const currentWeek = (weeks) => weeks[weeks.length - 1] ?? 0;

// null (rather than 0) when there's no prior week at all — a baseline of
// "nothing" should never quietly participate in a % comparison as if it were
// a real zero baseline.
export function baselineMean(weeks) {
  if (weeks.length < 2) return null;
  const baseline = weeks.slice(0, -1);
  return baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
}

// Threshold-based spike detector shared by every "X spiked above its normal
// range" alert (Personal/Team/Workflow spend spike, Request burst, Cost per
// request jump) — the same three-gate rule the mockup's Alert settings panel
// exposes: a minimum absolute delta, a minimum % delta, and a minimum
// baseline sample size (so a near-zero baseline can't trigger a "spike" off
// a tiny absolute swing).
export function detectSpike(
  weeks,
  { minDelta = 0, minChangePct = 0, minBaselineTotal = 0 } = {},
) {
  const expected = baselineMean(weeks);
  const current = currentWeek(weeks);
  if (expected == null) {
    return { triggered: false, current, expected: null, delta: null, changePct: null };
  }
  const baselineTotal = weeks.slice(0, -1).reduce((sum, v) => sum + v, 0);
  const delta = current - expected;
  const changePct =
    expected > 0 ? (delta / expected) * 100 : current > 0 ? Infinity : 0;
  const triggered =
    baselineTotal >= minBaselineTotal &&
    delta >= minDelta &&
    changePct >= minChangePct;
  return { triggered, current, expected, delta, changePct };
}

// "Spend rising week after week" — the trailing `consecutiveWeeks` entries
// (baseline weeks + current) are non-decreasing, with at least one real
// increase somewhere in the run (a flat series isn't a trend).
export function detectSustainedGrowth(weeks, consecutiveWeeks) {
  if (weeks.length < consecutiveWeeks) return false;
  const tail = weeks.slice(-consecutiveWeeks);
  let increasedOnce = false;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i] < tail[i - 1]) return false;
    if (tail[i] > tail[i - 1]) increasedOnce = true;
  }
  return increasedOnce;
}

// Per-week cost-per-request series from aligned spend/requests weekly series
// — feed the result back into detectSpike() for "Cost per request jump" /
// "Calls became more expensive" / "Higher-cost model pattern" (same
// formula; a rate jump without a matching requests jump reads as a
// model-mix shift rather than more work, which is why the mockup frames it
// as a distinct card).
export function costPerRequestWeeks(spendWeeks, requestWeeks) {
  return spendWeeks.map((spend, i) => {
    const requests = requestWeeks[i];
    return requests > 0 ? spend / requests : null;
  });
}

// Cross-checks the hand-maintained MODEL_LIFECYCLE_EVENTS reference (see
// lib/format.mjs) against the company's actual per-model usage, so only
// entries relevant to models actually in use surface — each annotated with
// the current week's spend on the affected model(s), matching the mockup's
// "$640 weekly spend affected" line.
export function matchLifecycleEvents(events, modelWeeklySpend) {
  return events
    .map((event) => {
      const affected = event.modelIds.filter((id) => modelWeeklySpend.has(id));
      if (affected.length === 0) return null;
      const currentWeeklySpend = affected.reduce(
        (sum, id) => sum + (modelWeeklySpend.get(id) ?? 0),
        0,
      );
      return { ...event, affectedModelIds: affected, currentWeeklySpend };
    })
    .filter(Boolean);
}

// Company-vs-provider blended token rate for the Token & rate panel. Mirrors
// computeCachingSavings() in server.mjs exactly — "company" is what was
// actually billed; "provider, same mix" is what the same token volumes
// would cost if every cache-eligible token were billed at the plain
// uncached rate instead (i.e. the $ value of the caching discount),
// generalized to include output tokens, which caching never discounts and
// so contribute equally to both sides of the comparison.
export function blendedRate({
  actualInputCost,
  hypotheticalInputCost,
  outputCost,
  totalInputTokens,
  outputTokens,
}) {
  const totalTokens = totalInputTokens + outputTokens;
  if (totalTokens <= 0) return { companyRate: null, providerRate: null };
  const companyRate = ((actualInputCost + outputCost) / totalTokens) * 1e6;
  const providerRate =
    hypotheticalInputCost == null
      ? null
      : ((hypotheticalInputCost + outputCost) / totalTokens) * 1e6;
  return { companyRate, providerRate };
}

// Per-model list-price reference (Anthropic or OpenAI): what a model's
// actual token volumes would cost at today's published MODEL_PRICING /
// OPENAI_MODEL_PRICING rate. Cache-write tokens are approximated at the
// plain input rate — Anthropic's real cache-write premium varies by TTL
// (5m vs 1h) and isn't itself tracked in MODEL_PRICING, so this is a
// deliberate approximation rather than an exact figure.
export function modelListPriceCost(pricing, usage) {
  const {
    uncachedInputTokens = 0,
    cacheReadInputTokens = 0,
    cacheCreationTokens = 0,
    outputTokens = 0,
  } = usage;
  return (
    (uncachedInputTokens * pricing.input +
      cacheReadInputTokens * pricing.cached +
      cacheCreationTokens * pricing.input +
      outputTokens * pricing.output) /
    1e6
  );
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// "Higher-cost model pattern" — company-wide only, not per-person/per-team:
// /api/people and /api/teams only return each entity's total spend, with no
// per-model breakdown, so there's no data source for "this *person's* mix
// shifted toward pricier models." What IS available (per-model weekly spend
// from /api/cost-summary's byModel) can still show the same underlying
// pattern at company scope — flags when a model priced above the company's
// median gains spend share while a cheaper model loses it, which explains a
// cost rise that pure volume growth wouldn't.
export function detectHigherCostModelPattern(models, { minShareChangePct = 5 } = {}) {
  const withTotals = models.map((m) => ({
    ...m,
    baseline: baselineMean(m.spendWeeks),
    current: currentWeek(m.spendWeeks),
  }));
  const baselineTotal = withTotals.reduce((s, m) => s + (m.baseline ?? 0), 0);
  const currentTotal = withTotals.reduce((s, m) => s + m.current, 0);
  if (baselineTotal <= 0 || currentTotal <= 0) return null;

  const medianPrice = median(models.map((m) => m.avgPricePerMillion));
  let best = null;
  for (const m of withTotals) {
    if (m.baseline == null || m.avgPricePerMillion <= medianPrice) continue;
    const baselineShare = (m.baseline / baselineTotal) * 100;
    const currentShare = (m.current / currentTotal) * 100;
    const shareDelta = currentShare - baselineShare;
    if (shareDelta >= minShareChangePct && (!best || shareDelta > best.shareDelta)) {
      best = { ...m, baselineShare, currentShare, shareDelta };
    }
  }
  return best;
}

// Top-level alert composer: turns a flat list of entities (each already
// reduced to aligned weekly spend/requests series — see weeklyTotalsFromDaily
// above for the daily->weekly step) into the triggered-alert list the
// Briefing panel renders. `settings` mirrors the Alert settings panel's
// fields exactly (minChangePct, minDeltaUsd, requestFloor, trendWeeks).
//
// Most alerts' impactUsd is the entity's raw spend delta (current week vs
// baseline mean), independent of which specific signal (spend vs. requests)
// actually triggered the card — e.g. "Request burst" is triggered by a
// *requests* spike, but reports the accompanying $ impact so every card type
// is comparable for driver-ranking (see summarizeAlerts). The two
// cost-per-request-based types (costPerRequestJump/callsMoreExpensive) are
// the exception: their impactUsd is the rate change times this week's own
// request volume (see costImpactUsd below), since the entity's total spend
// delta is unrelated to what actually triggered a *rate* alert.
export function computeAlerts(entities, settings) {
  const { minChangePct = 0, minDeltaUsd = 0, requestFloor = 0, trendWeeks = 3 } =
    settings;
  const alerts = [];

  for (const e of entities) {
    const baselineRequestTotal = e.requestWeeks
      .slice(0, -1)
      .reduce((sum, v) => sum + v, 0);
    if (baselineRequestTotal < requestFloor) continue;

    const spendSpike = detectSpike(e.spendWeeks, {
      minDelta: minDeltaUsd,
      minChangePct,
    });
    const costPerRequestSeries = costPerRequestWeeks(
      e.spendWeeks,
      e.requestWeeks,
    ).map((v) => v ?? 0);
    const costSpikePct = detectSpike(costPerRequestSeries, { minChangePct });
    // A % rate change alone isn't gated by "minimum extra spend" — a noisy 30%+ swing on a
    // near-zero baseline rate can clear the % bar while being worth pennies. Multiplying the
    // rate delta by this week's own request volume turns "rate rose 65%" into "that rate rise
    // is costing about $X extra this week", which is what minDeltaUsd is meant to gate, and a
    // far more meaningful "+$X above range" figure to show than the entity's unrelated total
    // spend delta.
    const costPerRequestExpected = baselineMean(costPerRequestSeries);
    const costImpactUsd =
      costPerRequestExpected != null
        ? (currentWeek(costPerRequestSeries) - costPerRequestExpected) * currentWeek(e.requestWeeks)
        : null;
    const costSpike = {
      ...costSpikePct,
      triggered: costSpikePct.triggered && costImpactUsd != null && costImpactUsd >= minDeltaUsd,
    };
    const impactUsd = spendSpike.delta ?? 0;

    if (e.kind === "person" || e.kind === "team") {
      const category = e.kind === "person" ? "people" : "team";
      if (spendSpike.triggered) {
        alerts.push({
          id: `${e.kind}-spend-${e.id}`,
          category,
          type: e.kind === "person" ? "personalSpendSpike" : "teamSpendSpike",
          title: e.kind === "person" ? "Personal spend spike" : "Team spend spike",
          entity: e,
          impactUsd,
          metric: spendSpike,
        });
      }
      if (costSpike.triggered) {
        alerts.push({
          id: `${e.kind}-cpr-${e.id}`,
          category,
          type: "costPerRequestJump",
          title: "Cost per request jump",
          entity: e,
          impactUsd: costImpactUsd,
          metric: costSpike,
        });
      }
    }

    if (e.kind === "workflow" || e.kind === "product") {
      const requestSpike = detectSpike(e.requestWeeks, { minChangePct });
      if (spendSpike.triggered) {
        alerts.push({
          id: `workflow-spend-${e.id}`,
          category: "workflow",
          type: "workflowSpendSpike",
          title: "Workflow spend spike",
          entity: e,
          impactUsd,
          metric: spendSpike,
        });
      }
      if (requestSpike.triggered) {
        alerts.push({
          id: `workflow-requests-${e.id}`,
          category: "workflow",
          type: "requestBurst",
          title: "Request burst",
          entity: e,
          impactUsd,
          metric: requestSpike,
        });
      }
      if (costSpike.triggered) {
        alerts.push({
          id: `workflow-cpr-${e.id}`,
          category: "workflow",
          type: "callsMoreExpensive",
          title: "Calls became more expensive",
          entity: e,
          impactUsd: costImpactUsd,
          metric: costSpike,
        });
      }
      if (detectSustainedGrowth(e.spendWeeks, trendWeeks)) {
        alerts.push({
          id: `workflow-trend-${e.id}`,
          category: "workflow",
          type: "sustainedGrowth",
          title: "Spend rising week after week",
          entity: e,
          impactUsd,
          metric: { trendWeeks },
        });
      }
    }
  }

  return alerts;
}

// Assembles the Briefing headline numbers from a flat list of already-
// triggered alerts (each `{ category, impactUsd, ... }`). The headline total
// only sums alerts with a real $ impact (a request-burst-only alert has
// none); "3 main cost drivers" picks the single largest-impact alert per
// category, up to 3 — mirroring the mockup's one-per-category driver cards.
export function summarizeAlerts(alerts) {
  const withImpact = alerts.filter(
    (a) => typeof a.impactUsd === "number" && a.impactUsd > 0,
  );
  const totalAboveExpected = withImpact.reduce((sum, a) => sum + a.impactUsd, 0);
  const byCategory = new Map();
  for (const alert of [...withImpact].sort((a, b) => b.impactUsd - a.impactUsd)) {
    if (!byCategory.has(alert.category)) byCategory.set(alert.category, alert);
  }
  return {
    totalAboveExpected,
    caseCount: alerts.length,
    topDrivers: [...byCategory.values()].slice(0, 3),
  };
}
