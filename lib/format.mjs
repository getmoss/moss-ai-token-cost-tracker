// Pure formatting/lookup/comparison helpers shared by index.html's dashboard script.
// Extracted verbatim (same bodies, same names) so they're unit-testable with node --test —
// see test/format.test.mjs. Everything DOM/state-dependent stays in index.html itself.

export const money = (n) => {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(2)}`;
};
export const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
export const signedMoney = (n) => (n >= 0 ? `+${money(n)}` : money(n));
export const signedNumber = (n) =>
  `${n >= 0 ? "+" : "-"}${Math.round(Math.abs(n)).toLocaleString()}`;
export const compactNumber = (n) => {
  const v = Math.abs(n);
  if (v >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n)}`;
};

// Static approximate FX rates for the small grey EUR/GBP amounts shown next
// to USD values (Company overview KPIs + both charts' axes) — not live
// rates, per spec; revisit if the business ever needs exact conversions.
export const EUR_RATE = 0.86;
export const GBP_RATE = 0.74;

// e.g. fxLabel(4400, EUR_RATE, "€") -> "€3.8k"
export const fxLabel = (usd, rate, symbol) => {
  const amount = usd * rate;
  const sign = amount < 0 ? "-" : "";
  const v = Math.abs(amount);
  return v >= 1000
    ? `${sign}${symbol}${(v / 1000).toFixed(1)}k`
    : `${sign}${symbol}${v.toFixed(0)}`;
};

// e.g. convertedLabel(4400) -> "€3.8k · £3.3k"
export const convertedLabel = (usd) =>
  `${fxLabel(usd, EUR_RATE, "€")} · ${fxLabel(usd, GBP_RATE, "£")}`;

const WEEKDAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
// isoDate: "YYYY-MM-DD" — parsed as UTC midnight so the weekday doesn't
// shift with the browser's local timezone.
export const weekdayAbbr = (isoDate) =>
  WEEKDAY_ABBR[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
// isoDate: "YYYY-MM-DD" — used for the overview chart's x-axis when grouped
// by month, where a weekday name for an arbitrary bucket-start day isn't
// meaningful (see weekdayAbbr above).
export const monthAbbr = (isoDate) =>
  MONTH_ABBR[Number(isoDate.slice(5, 7)) - 1];

export function pctChange(current, previous) {
  if (previous == null || previous === 0 || current == null) return null;
  return ((current - previous) / previous) * 100;
}

// Color is a semantic "is this good or bad" judgment, not literal sign — an
// increase is green by default (more usage, more adoption: good), except
// for cost/spend metrics passed `invert: true`, where an increase is bad
// (more spend: red) and a decrease is good (less spend: green). The arrow
// direction always reflects the literal sign regardless of `invert`, since
// it's reporting a fact ("this went up"), not a judgment.
export function trendBadge(diffValue, { unit = "%", extra = "", invert = false } = {}) {
  if (diffValue == null || !Number.isFinite(diffValue)) return "";
  const isUp = diffValue >= 0;
  const isGood = invert ? !isUp : isUp;
  const cls = isGood ? "trend-good" : "trend-bad";
  const arrow = isUp ? "▲" : "▼";
  return `<span class="${cls}">${arrow} ${Math.abs(diffValue).toFixed(1)}${unit}${extra}</span>`;
}

export const productLabel = (p) =>
  ({
    chat: "Chat",
    cowork: "Cowork",
    claude_code: "Claude Code",
    claude_in_chrome: "Claude in Chrome",
    claude_design: "Claude Design",
    office_agent: "Office Agent",
    research: "Research",
    "claude-tag": "Claude in Slack",
    cc_security_autopatch: "Security autopatch",
  })[p] ?? p;

// Rate-card reference for the Model tab only — USD per 1M tokens, from
// platform.claude.com/docs/en/about-claude/pricing (checked 2026-09-01).
// Anthropic-only: our Model breakdown itself is Anthropic-only (no
// per-model OpenAI data source — see Step 6/7 notes), so there's
// nothing to look up for GPT models here yet. Needs occasional manual
// review as Anthropic's pricing changes.
export const MODEL_PRICING = {
  "claude-fable-5": { input: 10, cached: 1, output: 50 },
  "claude-mythos-5": { input: 10, cached: 1, output: 50 },
  "claude-opus-5": { input: 5, cached: 0.5, output: 25 },
  "claude-opus-4-8": { input: 5, cached: 0.5, output: 25 },
  "claude-opus-4-7": { input: 5, cached: 0.5, output: 25 },
  "claude-opus-4-6": { input: 5, cached: 0.5, output: 25 },
  "claude-opus-4-5": { input: 5, cached: 0.5, output: 25 },
  "claude-sonnet-5": { input: 2, cached: 0.2, output: 10 },
  "claude-sonnet-4-6": { input: 3, cached: 0.3, output: 15 },
  "claude-sonnet-4-5": { input: 3, cached: 0.3, output: 15 },
  "claude-haiku-4-5": { input: 1, cached: 0.1, output: 5 },
};
// Model ids sometimes carry a trailing snapshot date (e.g.
// claude-haiku-4-5-20251001) — strip it before matching the table above.
export function modelPricingFor(modelId) {
  return MODEL_PRICING[modelId.replace(/-\d{8}$/, "")] ?? null;
}

// Same rate-card reference as MODEL_PRICING above, but for OpenAI — from
// developers.openai.com/api/docs/pricing (checked 2026-09-01). Company-side
// OpenAI usage in this app only carries $ amounts and request counts (no
// token counts — the Costs API doesn't return them and the Usage API only
// exposes num_model_requests), so this table backs the Saving opportunities
// "which model fits the job" modal and the per-model list-price reference,
// not a $/1M-token company-vs-provider comparison the way MODEL_PRICING does.
export const OPENAI_MODEL_PRICING = {
  "gpt-6-astra": { input: 10, cached: 1, output: 50 },
  "gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
};
export function openaiModelPricingFor(modelId) {
  return OPENAI_MODEL_PRICING[modelId] ?? null;
}

// Hand-maintained reference of official provider announcements (retirements,
// price changes, new releases, capability/limit changes, caching-economics
// changes) — there's no API that exposes this, so like MODEL_PRICING above,
// it's refreshed by hand as providers announce changes. The Saving
// opportunities "AI model updates" alert group cross-checks `modelIds`
// against the company's actual per-model usage so only entries relevant to
// models the company actually uses ever surface.
export const MODEL_LIFECYCLE_EVENTS = [
  {
    id: "anthropic-opus-4-1-retirement",
    type: "retirement",
    provider: "anthropic",
    modelIds: ["claude-opus-4-1"],
    title: "Model retirement ahead",
    announcedDate: "2026-08-01",
    effectiveDate: "2026-10-28",
    sourceUrl:
      "https://platform.claude.com/docs/en/about-claude/model-deprecations",
    observation:
      "Claude Opus 4.1 retires on 28 October 2026.",
    likelyReason:
      "The provider is ending support. Calls may fail after retirement, and the replacement may have different pricing.",
    recommendation:
      "IT should test the recommended replacement (Claude Opus 5) and migrate before the deadline.",
  },
];

// Nulls (e.g. no previous-period data) always sort to the bottom,
// regardless of direction — otherwise ascending sort would surface
// "n/a" rows first, which reads as an error rather than a real row.
export function compareRows(a, b, key, dir) {
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return dir === "asc" ? av - bv : bv - av;
}

export function foldOther(series, cap = 6) {
  const named = series.map((s, i) => ({ ...s, colorIndex: i }));
  if (named.length <= cap + 1) return named;
  const top = named.slice(0, cap);
  const rest = named.slice(cap);
  const length = series[0]?.spend.length ?? 0;
  const otherSpend = new Array(length).fill(0);
  let totalSpend = 0,
    requests = 0;
  for (const s of rest) {
    s.spend.forEach((v, i) => {
      otherSpend[i] += v;
    });
    totalSpend += s.totalSpend;
    requests += s.requests;
  }
  top.push({
    name: "Other",
    spend: otherSpend,
    totalSpend,
    requests,
    colorIndex: "other",
  });
  return top;
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
export const isoDaysAgo = (days) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
