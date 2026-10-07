import { test } from "node:test";
import assert from "node:assert/strict";
import { loootTools, LoootApiError } from "../src/index.ts";

type Call = { url: URL; init: RequestInit };

function fakeFetch(calls: Call[], status = 200, body: unknown = { ok: true }): typeof fetch {
  return (async (url: URL, init: RequestInit) => {
    calls.push({ url: new URL(String(url)), init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const ctx = { toolCallId: "t", messages: [] } as never;

test("exposes the five tools", () => {
  const t = loootTools({ apiKey: "k" });
  assert.deepEqual(Object.keys(t).sort(), ["getBalance", "getRun", "inspectOperation", "runOperation", "searchCatalog"]);
});

test("searchCatalog sends bearer token and q", async () => {
  const calls: Call[] = [];
  const t = loootTools({ apiKey: "tok", fetch: fakeFetch(calls) });
  await t.searchCatalog.execute!({ q: "find email" }, ctx);
  assert.equal(calls[0]!.url.pathname, "/v1/catalog/search");
  assert.equal(calls[0]!.url.searchParams.get("q"), "find email");
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, "Bearer tok");
});

test("runOperation posts to /v1/runs with wait in the query and an idempotency key", async () => {
  const calls: Call[] = [];
  const t = loootTools({ apiKey: "tok", fetch: fakeFetch(calls) });
  await t.runOperation.execute!({ endpointId: "e1", input: { a: 1 } }, ctx);
  const c = calls[0]!;
  assert.equal(c.init.method, "POST");
  assert.equal(c.url.pathname, "/v1/runs");
  assert.equal(c.url.searchParams.get("wait"), "20");
  const body = JSON.parse(String(c.init.body));
  assert.equal(body.endpointId, "e1");
  assert.match(body.idempotencyKey, /^ai-sdk-/);
});

test("requireApproval turns on needsApproval", () => {
  assert.equal(loootTools({ apiKey: "k", requireApproval: true }).runOperation.needsApproval, true);
  assert.equal(loootTools({ apiKey: "k" }).runOperation.needsApproval, false);
});

test("API errors become LoootApiError", async () => {
  const calls: Call[] = [];
  const t = loootTools({ apiKey: "tok", fetch: fakeFetch(calls, 402, { error: { code: "insufficient_balance", message: "top up" } }) });
  await assert.rejects(async () => t.getBalance.execute!({}, ctx), (e: unknown) => e instanceof LoootApiError && e.code === "insufficient_balance" && e.status === 402);
});

test("missing token fails before any request", async () => {
  delete process.env.LOOOT_TOKEN;
  const calls: Call[] = [];
  const t = loootTools({ fetch: fakeFetch(calls) });
  await assert.rejects(async () => t.getBalance.execute!({}, ctx), /LOOOT_TOKEN/);
  assert.equal(calls.length, 0);
});
