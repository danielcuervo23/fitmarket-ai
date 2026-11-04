import assert from "node:assert/strict";
import { createOpenAICaller } from "./openai.ts";

// A per-request timeoutMs shorter than the default aborts the call in time.
// fetch is replaced by one that never answers until it is aborted.
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (_url, options) =>
    new Promise((_, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });

  try {
    const call = createOpenAICaller({ apiKey: "test-key" });
    const started = Date.now();
    const response = await call({
      system: "s",
      user: "u",
      responseFormat: {},
      timeoutMs: 50,
    });
    const elapsed = Date.now() - started;

    assert.equal(response.errorCode, "ai_timeout");
    assert.ok(elapsed < 2_000, `aborted after ${elapsed} ms, expected ~50 ms`);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Without a key nothing is sent.
{
  const response = await createOpenAICaller({ apiKey: undefined })({
    system: "s",
    user: "u",
    responseFormat: {},
  });
  assert.equal(response.errorCode, "server_config");
}

console.log("openai: all checks passed");
