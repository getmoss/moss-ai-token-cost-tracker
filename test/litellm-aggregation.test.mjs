import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateLiteLlmDailyActivity,
  buildLiteLlmUrl,
} from "../server.mjs";

// Fixtures below are hand-built to match the real /user/daily/activity response shape,
// confirmed against litellm/types/proxy/management_endpoints/common_daily_activity.py
// (SpendMetrics, DailySpendMetadata, BreakdownMetrics, KeyMetricWithMetadata, DailySpendData)
// — not live data, no real keys, hashes, or emails anywhere in this file.

test("aggregateLiteLlmDailyActivity: empty input yields zero totals and empty breakdowns", () => {
  const result = aggregateLiteLlmDailyActivity([]);
  assert.equal(result.totalSpend, 0);
  assert.equal(result.totalRequests, 0);
  assert.deepEqual([...result.dailyByDate.entries()], []);
  assert.deepEqual(result.byModel, []);
  assert.deepEqual(result.byTeam, []);
  assert.deepEqual(result.byKeyAlias, []);
  assert.deepEqual(result.byUser, []);
  assert.deepEqual(result.providers, []);
});

test("aggregateLiteLlmDailyActivity: sums spend/tokens/requests per day across multiple days", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: {
        spend: 4.5,
        prompt_tokens: 1000,
        completion_tokens: 200,
        cache_read_input_tokens: 300,
        cache_creation_input_tokens: 50,
        total_tokens: 1200,
        api_requests: 10,
      },
      breakdown: { models: {}, providers: {}, api_keys: {} },
    },
    {
      date: "2026-03-02T00:00:00Z",
      metrics: {
        spend: 2.5,
        prompt_tokens: 500,
        completion_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        total_tokens: 600,
        api_requests: 5,
      },
      breakdown: { models: {}, providers: {}, api_keys: {} },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results);
  assert.equal(result.totalSpend, 7);
  assert.equal(result.totalRequests, 15);
  assert.deepEqual(result.dailyByDate.get("2026-03-01"), {
    spend: 4.5,
    requests: 10,
    promptTokens: 1000,
    completionTokens: 200,
    cacheReadTokens: 300,
    cacheCreationTokens: 50,
  });
  assert.deepEqual(result.dailyByDate.get("2026-03-02"), {
    spend: 2.5,
    requests: 5,
    promptTokens: 500,
    completionTokens: 100,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });
});

test("aggregateLiteLlmDailyActivity: attributes spend to team and key alias via breakdown.api_keys, sorted by spend descending", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 6, api_requests: 20 },
      breakdown: {
        models: {},
        providers: {},
        api_keys: {
          "hash-a": {
            metrics: { spend: 4, api_requests: 15 },
            metadata: { key_alias: "claude-code-cli", team_id: "team-eng" },
          },
          "hash-b": {
            metrics: { spend: 2, api_requests: 5 },
            metadata: { key_alias: "internal-bot", team_id: "team-support" },
          },
        },
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results);
  assert.deepEqual(result.byKeyAlias, [
    { alias: "claude-code-cli", spend: 4, requests: 15 },
    { alias: "internal-bot", spend: 2, requests: 5 },
  ]);
  assert.deepEqual(result.byTeam, [
    { teamId: "team-eng", spend: 4, requests: 15 },
    { teamId: "team-support", spend: 2, requests: 5 },
  ]);
});

test("aggregateLiteLlmDailyActivity: a key hash missing key_alias/team_id falls back to 'Unlabeled key'/'unassigned'", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 1, api_requests: 1 },
      breakdown: {
        models: {},
        providers: {},
        api_keys: { "hash-a": { metrics: { spend: 1, api_requests: 1 }, metadata: {} } },
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results);
  assert.equal(result.byKeyAlias[0].alias, "Unlabeled key");
  assert.equal(result.byTeam[0].teamId, "unassigned");
});

test("aggregateLiteLlmDailyActivity: surfaces breakdown.models as a sorted byModel array", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 10, api_requests: 20 },
      breakdown: {
        models: {
          "claude-sonnet-5": { metrics: { spend: 7, api_requests: 14 } },
          "gpt-5.6-sol": { metrics: { spend: 3, api_requests: 6 } },
        },
        providers: {},
        api_keys: {},
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results);
  assert.deepEqual(result.byModel, [
    { name: "claude-sonnet-5", spend: 7, requests: 14 },
    { name: "gpt-5.6-sol", spend: 3, requests: 6 },
  ]);
});

test("aggregateLiteLlmDailyActivity: surfaces breakdown.providers as a plain list, for the double-count warning", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 1, api_requests: 1 },
      breakdown: {
        models: {},
        providers: { anthropic: {}, openai: {} },
        api_keys: {},
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results);
  assert.deepEqual(result.providers.sort(), ["anthropic", "openai"]);
});

// GDPR data-minimization: per-user email/id must never appear unless the caller explicitly
// opts in — aggregateLiteLlmDailyActivity itself stays pure (no env reads), so this is
// testable without mutating process.env.
test("aggregateLiteLlmDailyActivity: byUser stays empty by default even when user_email is present", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 1, api_requests: 1 },
      breakdown: {
        models: {},
        providers: {},
        api_keys: {
          "hash-a": {
            metrics: { spend: 1, api_requests: 1 },
            metadata: { key_alias: "k", team_id: "t", user_email: "person@example.com" },
          },
        },
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results);
  assert.deepEqual(result.byUser, []);
});

test("aggregateLiteLlmDailyActivity: byUser is populated only when includeUserBreakdown is explicitly passed", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 3, api_requests: 3 },
      breakdown: {
        models: {},
        providers: {},
        api_keys: {
          "hash-a": {
            metrics: { spend: 3, api_requests: 3 },
            metadata: { key_alias: "k", team_id: "t", user_email: "person@example.com" },
          },
        },
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results, { includeUserBreakdown: true });
  assert.deepEqual(result.byUser, [{ user: "person@example.com", spend: 3, requests: 3 }]);
});

test("aggregateLiteLlmDailyActivity: falls back to user_id when user_email is absent, with breakdown enabled", () => {
  const results = [
    {
      date: "2026-03-01T00:00:00Z",
      metrics: { spend: 2, api_requests: 2 },
      breakdown: {
        models: {},
        providers: {},
        api_keys: {
          "hash-a": {
            metrics: { spend: 2, api_requests: 2 },
            metadata: { key_alias: "k", team_id: "t", user_id: "user-123", user_email: null },
          },
        },
      },
    },
  ];
  const result = aggregateLiteLlmDailyActivity(results, { includeUserBreakdown: true });
  assert.deepEqual(result.byUser, [{ user: "user-123", spend: 2, requests: 2 }]);
});

test("aggregateLiteLlmDailyActivity: a day with no metrics/breakdown at all defaults to zero rather than throwing", () => {
  const result = aggregateLiteLlmDailyActivity([{ date: "2026-03-01T00:00:00Z" }]);
  assert.equal(result.totalSpend, 0);
  assert.equal(result.totalRequests, 0);
  assert.deepEqual(result.dailyByDate.get("2026-03-01"), {
    spend: 0,
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });
});

// Hard constraint: this app must only ever make GET requests to an allowlisted set of
// LiteLLM paths — never /global/spend/reset, /key/generate, /key/delete, or any other
// management route. buildLiteLlmUrl is the single choke point every fetcher goes through.
test("buildLiteLlmUrl: allows the one approved read path", () => {
  const url = buildLiteLlmUrl("https://proxy.example.com", "/user/daily/activity", {
    start_date: "2026-03-01",
    end_date: "2026-03-02",
  });
  assert.equal(url.origin + url.pathname, "https://proxy.example.com/user/daily/activity");
  assert.equal(url.searchParams.get("start_date"), "2026-03-01");
});

test("buildLiteLlmUrl: refuses a non-allowlisted path, even a plausible-looking read endpoint", () => {
  assert.throws(
    () => buildLiteLlmUrl("https://proxy.example.com", "/spend/logs/v2", {}),
    /non-allowlisted/,
  );
});

test("buildLiteLlmUrl: refuses known management/mutating routes", () => {
  for (const path of ["/global/spend/reset", "/key/generate", "/key/delete", "/team/delete"]) {
    assert.throws(() => buildLiteLlmUrl("https://proxy.example.com", path, {}), /non-allowlisted/);
  }
});
