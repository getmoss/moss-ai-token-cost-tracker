import { test } from "node:test";
import assert from "node:assert/strict";
import { setupPageCopy, resolveKeysToPersist, verifyKey } from "../server.mjs";

test("setupPageCopy: 'setup' mode (first run, nothing configured) shows all three cards", () => {
  const copy = setupPageCopy("setup");
  assert.deepEqual(copy.cards, ["anthropic", "openai", "litellm"]);
  assert.equal(copy.buttonLabel, "Open dashboard");
});

test("setupPageCopy: 'setup' mode scopes cards to whichever providers are passed as still-missing", () => {
  const copy = setupPageCopy("setup", ["openai", "litellm"]);
  assert.deepEqual(copy.cards, ["openai", "litellm"]);
});

test("setupPageCopy: 'add-litellm' shows only the LiteLLM card", () => {
  const copy = setupPageCopy("add-litellm");
  assert.deepEqual(copy.cards, ["litellm"]);
  assert.equal(copy.buttonLabel, "Add LiteLLM");
});

test("setupPageCopy: 'change-litellm' shows only the LiteLLM card, framed as an update", () => {
  const copy = setupPageCopy("change-litellm");
  assert.deepEqual(copy.cards, ["litellm"]);
  assert.equal(copy.buttonLabel, "Save key");
  assert.match(copy.title, /change/i);
});

test("setupPageCopy: 'add-openai' shows only the OpenAI card and never mentions adoption", () => {
  const copy = setupPageCopy("add-openai");
  assert.deepEqual(copy.cards, ["openai"]);
  assert.equal(copy.buttonLabel, "Add ChatGPT");
  // Adoption/seat data is Anthropic-only (see available-data-points.md) — connecting OpenAI
  // can never unlock it, so this copy must not imply otherwise.
  assert.doesNotMatch(copy.title + " " + copy.subtitle, /adoption/i);
});

test("setupPageCopy: 'add-anthropic' shows only the Anthropic card and does mention adoption", () => {
  const copy = setupPageCopy("add-anthropic");
  assert.deepEqual(copy.cards, ["anthropic"]);
  assert.equal(copy.buttonLabel, "Add Claude");
  // Connecting Anthropic genuinely does unlock Claude adoption tracking, so this copy is
  // allowed — and expected — to say so.
  assert.match(copy.title + " " + copy.subtitle, /adoption/i);
});

test("setupPageCopy: 'change-anthropic' shows only the Anthropic card, framed as an update not a first connect", () => {
  const copy = setupPageCopy("change-anthropic");
  assert.deepEqual(copy.cards, ["anthropic"]);
  assert.equal(copy.buttonLabel, "Save key");
  assert.match(copy.title, /change/i);
});

test("setupPageCopy: 'change-openai' shows only the OpenAI card, framed as an update not a first connect", () => {
  const copy = setupPageCopy("change-openai");
  assert.deepEqual(copy.cards, ["openai"]);
  assert.equal(copy.buttonLabel, "Save key");
  assert.match(copy.title, /change/i);
});

// Regression coverage for the silent .env-overwrite bug fixed earlier: adding one provider
// to an already-configured install must never drop another, already-working key.
test("resolveKeysToPersist: first run, all three submitted, are all persisted", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "sk-ant-new",
    openaiKey: "sk-openai-new",
    anthropicEnabled: false,
    openaiEnabled: false,
    existingAnthropicKey: undefined,
    existingOpenaiKey: undefined,
    litellmKey: "sk-litellm-new",
    litellmBaseUrl: "https://litellm.example.com",
    litellmEnabled: false,
    existingLitellmKey: undefined,
    existingLitellmBaseUrl: undefined,
  });
  assert.deepEqual(result, {
    finalAnthropicKey: "sk-ant-new",
    finalOpenaiKey: "sk-openai-new",
    finalLitellmKey: "sk-litellm-new",
    finalLitellmBaseUrl: "https://litellm.example.com",
  });
});

test("resolveKeysToPersist: first run, only one key submitted, the others stay empty (not undefined)", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "sk-ant-new",
    openaiKey: "",
    anthropicEnabled: false,
    openaiEnabled: false,
    existingAnthropicKey: undefined,
    existingOpenaiKey: undefined,
    litellmKey: "",
    litellmBaseUrl: "",
    litellmEnabled: false,
    existingLitellmKey: undefined,
    existingLitellmBaseUrl: undefined,
  });
  assert.deepEqual(result, {
    finalAnthropicKey: "sk-ant-new",
    finalOpenaiKey: "",
    finalLitellmKey: "",
    finalLitellmBaseUrl: "",
  });
});

test("resolveKeysToPersist: adding OpenAI to an Anthropic-only install keeps the existing Anthropic key", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "",
    openaiKey: "sk-openai-new",
    anthropicEnabled: true,
    openaiEnabled: false,
    existingAnthropicKey: "sk-ant-existing",
    existingOpenaiKey: undefined,
    litellmKey: "",
    litellmBaseUrl: "",
    litellmEnabled: false,
    existingLitellmKey: undefined,
    existingLitellmBaseUrl: undefined,
  });
  assert.deepEqual(result, {
    finalAnthropicKey: "sk-ant-existing",
    finalOpenaiKey: "sk-openai-new",
    finalLitellmKey: "",
    finalLitellmBaseUrl: "",
  });
});

test("resolveKeysToPersist: adding Anthropic to an OpenAI-only install keeps the existing OpenAI key", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "sk-ant-new",
    openaiKey: "",
    anthropicEnabled: false,
    openaiEnabled: true,
    existingAnthropicKey: undefined,
    existingOpenaiKey: "sk-openai-existing",
    litellmKey: "",
    litellmBaseUrl: "",
    litellmEnabled: false,
    existingLitellmKey: undefined,
    existingLitellmBaseUrl: undefined,
  });
  assert.deepEqual(result, {
    finalAnthropicKey: "sk-ant-new",
    finalOpenaiKey: "sk-openai-existing",
    finalLitellmKey: "",
    finalLitellmBaseUrl: "",
  });
});

test("resolveKeysToPersist: all three already enabled with empty new-input preserves all three existing values", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "",
    openaiKey: "",
    anthropicEnabled: true,
    openaiEnabled: true,
    existingAnthropicKey: "sk-ant-existing",
    existingOpenaiKey: "sk-openai-existing",
    litellmKey: "",
    litellmBaseUrl: "",
    litellmEnabled: true,
    existingLitellmKey: "sk-litellm-existing",
    existingLitellmBaseUrl: "https://litellm.example.com",
  });
  assert.deepEqual(result, {
    finalAnthropicKey: "sk-ant-existing",
    finalOpenaiKey: "sk-openai-existing",
    finalLitellmKey: "sk-litellm-existing",
    finalLitellmBaseUrl: "https://litellm.example.com",
  });
});

test("resolveKeysToPersist: adding LiteLLM to an Anthropic+OpenAI install keeps both existing keys", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "",
    openaiKey: "",
    anthropicEnabled: true,
    openaiEnabled: true,
    existingAnthropicKey: "sk-ant-existing",
    existingOpenaiKey: "sk-openai-existing",
    litellmKey: "sk-litellm-new",
    litellmBaseUrl: "https://litellm.example.com",
    litellmEnabled: false,
    existingLitellmKey: undefined,
    existingLitellmBaseUrl: undefined,
  });
  assert.deepEqual(result, {
    finalAnthropicKey: "sk-ant-existing",
    finalOpenaiKey: "sk-openai-existing",
    finalLitellmKey: "sk-litellm-new",
    finalLitellmBaseUrl: "https://litellm.example.com",
  });
});

test("resolveKeysToPersist: a LiteLLM key submitted without a base URL is treated as not submitted", () => {
  const result = resolveKeysToPersist({
    anthropicKey: "",
    openaiKey: "",
    anthropicEnabled: false,
    openaiEnabled: false,
    existingAnthropicKey: undefined,
    existingOpenaiKey: undefined,
    litellmKey: "sk-litellm-new",
    litellmBaseUrl: "",
    litellmEnabled: false,
    existingLitellmKey: undefined,
    existingLitellmBaseUrl: undefined,
  });
  assert.equal(result.finalLitellmKey, "");
  assert.equal(result.finalLitellmBaseUrl, "");
});

function withStubbedFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = original;
  });
}

test("verifyKey: a 401 response is classified as a rejected key", async () => {
  await withStubbedFetch(
    async () => ({ status: 401 }),
    async () => {
      const message = await verifyKey("Claude", "https://example.test", {}, "permission denied");
      assert.match(message, /rejected/);
    }
  );
});

test("verifyKey: a 403 response passes through the provider-specific permission error unchanged", async () => {
  await withStubbedFetch(
    async () => ({ status: 403 }),
    async () => {
      const message = await verifyKey("ChatGPT", "https://example.test", {}, "generate an Admin API key");
      assert.equal(message, "generate an Admin API key");
    }
  );
});

test("verifyKey: a network failure does not block saving (returns null, not an error)", async () => {
  await withStubbedFetch(
    async () => {
      throw new Error("network down");
    },
    async () => {
      const message = await verifyKey("Claude", "https://example.test", {}, "permission denied");
      assert.equal(message, null);
    }
  );
});

test("verifyKey: a 200 response means the key is valid (returns null)", async () => {
  await withStubbedFetch(
    async () => ({ status: 200 }),
    async () => {
      const message = await verifyKey("Claude", "https://example.test", {}, "permission denied");
      assert.equal(message, null);
    }
  );
});

test("verifyKey: a 500 response is not treated as a rejected/permission-denied key (returns null, same as success)", async () => {
  await withStubbedFetch(
    async () => ({ status: 500 }),
    async () => {
      const message = await verifyKey("Claude", "https://example.test", {}, "permission denied");
      assert.equal(message, null);
    }
  );
});
