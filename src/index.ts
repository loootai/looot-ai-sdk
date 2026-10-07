import { tool } from "ai";
import { z } from "zod";

const DEFAULT_BASE_URL = "https://api.looot.ai";

export interface LoootToolOptions {
  /** Agent token. Defaults to the LOOOT_TOKEN environment variable. */
  apiKey?: string;
  /** Defaults to https://api.looot.ai. */
  baseUrl?: string;
  /** Custom fetch, for tests or proxies. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 75000, enough for a 60 second inline wait. */
  timeoutMs?: number;
}

/** Thrown when the looot API answers with a non-2xx status. */
export class LoootApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;
  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.name = "LoootApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

type Query = Record<string, string | number | undefined>;

function makeRequester(options: LoootToolOptions) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  return async function request(
    method: "GET" | "POST",
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<unknown> {
    const token = options.apiKey ?? process.env.LOOOT_TOKEN?.trim();
    if (!token) {
      throw new LoootApiError(401, "missing_token", "Set LOOOT_TOKEN or pass { apiKey }. Create a token at https://looot.ai.", null);
    }
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${token}` };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await doFetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 75_000),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const err = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
      throw new LoootApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? `${method} ${path} failed with ${res.status}`, parsed);
    }
    return parsed;
  };
}

/** Free. Ranked search over the looot catalog; returns endpoint ids with prices. */
export function searchCatalog(options: LoootToolOptions = {}) {
  const request = makeRequester(options);
  return tool({
    description:
      "Search the looot catalog of data API endpoints (work emails, phone numbers, company and people search, Google results, web pages, LinkedIn profiles). Describe the task in plain words. Returns ranked endpoints with endpointId and price. Free.",
    inputSchema: z.object({
      q: z.string().describe('What you want to do, e.g. "find a work email from a name and company domain"'),
      limit: z.number().int().min(1).max(25).optional().describe("Maximum number of results"),
    }),
    execute: async ({ q, limit }) => request("GET", "/v1/catalog/search", { query: { q, limit } }),
  });
}

/** Free. Input schema, output schema and the price of one endpoint. */
export function inspectOperation(options: LoootToolOptions = {}) {
  const request = makeRequester(options);
  return tool({
    description:
      "Read one looot endpoint before running it: input schema, output schema, price formula and estimated maximum cost. Call this after searchCatalog and before runOperation. Free.",
    inputSchema: z.object({
      endpointId: z.string().describe("An endpointId returned by searchCatalog"),
    }),
    execute: async ({ endpointId }) => request("GET", `/v1/operations/${encodeURIComponent(endpointId)}`),
  });
}

export interface RunOperationOptions extends LoootToolOptions {
  /** Ask the user to approve each run before it is charged. Default false. */
  requireApproval?: boolean;
}

/** Paid. Runs one endpoint; a failed call costs nothing. */
export function runOperation(options: RunOperationOptions = {}) {
  const request = makeRequester(options);
  return tool({
    description:
      "Run one looot endpoint and pay its price from the prepaid balance. A failed call costs nothing. Check status in the result: a bad input answers with status failed. If status is queued or running, call getRun with the run id.",
    inputSchema: z.object({
      endpointId: z.string().describe("An endpointId returned by searchCatalog"),
      input: z.record(z.string(), z.unknown()).describe("Input matching the schema from inspectOperation"),
      idempotencyKey: z.string().min(1).optional().describe("Reuse the same key to retry without paying twice"),
      waitSeconds: z.number().min(0).max(60).optional().describe("Seconds to wait for the result before returning a run id. Default 20"),
    }),
    needsApproval: options.requireApproval ?? false,
    execute: async ({ endpointId, input, idempotencyKey, waitSeconds }) =>
      request("POST", "/v1/runs", {
        query: { wait: waitSeconds ?? 20 },
        body: { endpointId, input, idempotencyKey: idempotencyKey ?? `ai-sdk-${globalThis.crypto.randomUUID()}` },
      }),
  });
}

/** Free. Status and result of one run. */
export function getRun(options: LoootToolOptions = {}) {
  const request = makeRequester(options);
  return tool({
    description: "Get the status, result and cost of a looot run by its run id. Free.",
    inputSchema: z.object({ runId: z.string().describe("The run id returned by runOperation") }),
    execute: async ({ runId }) => request("GET", `/v1/runs/${encodeURIComponent(runId)}`),
  });
}

/** Free. Prepaid balance. */
export function getBalance(options: LoootToolOptions = {}) {
  const request = makeRequester(options);
  return tool({
    description: "Read the prepaid looot balance (available and reserved) and the minimum top-up. Free.",
    inputSchema: z.object({}),
    execute: async () => request("GET", "/v1/balance"),
  });
}

/** All five tools, ready to pass as `tools` to generateText or streamText. */
export function loootTools(options: RunOperationOptions = {}) {
  return {
    searchCatalog: searchCatalog(options),
    inspectOperation: inspectOperation(options),
    runOperation: runOperation(options),
    getRun: getRun(options),
    getBalance: getBalance(options),
  };
}
