# @looot/ai-sdk

[looot](https://looot.ai) tools for the [Vercel AI SDK](https://ai-sdk.dev). looot gives an agent one key and one prepaid balance for 2,500+ data API endpoints: work emails, phone numbers, company and people search, Google results, web pages, LinkedIn profiles. The agent searches the catalog, sees the price before it runs, and pays per call. A failed call costs nothing. Top up from $5.

## Install for agents

```bash
npm install github:loootai/looot-ai-sdk ai zod
claude mcp add --transport http looot https://api.looot.ai/mcp
```

See also: [awesome-looot-use-cases](https://github.com/loootai/awesome-looot-use-cases) (copy-paste recipes) and [awesome-gtm](https://github.com/loootai/awesome-gtm) (open-source GTM tools).

> Status: public, MIT, not on npm yet. Install from GitHub until the first release.

## Example

```ts
import { generateText, gateway, isStepCount } from "ai";
import { loootTools } from "@looot/ai-sdk";

const { text } = await generateText({
  model: gateway("openai/gpt-5-mini"),
  prompt: "Find the work email of Jane Doe at example.com and tell me what it cost.",
  tools: loootTools(), // reads LOOOT_TOKEN
  stopWhen: isStepCount(8),
});
console.log(text);
```

Create an agent token at https://looot.ai and export it as `LOOOT_TOKEN`.

## Tools

| Tool | Does | Cost |
| --- | --- | --- |
| `searchCatalog` | Ranked endpoint search from a plain-words task | free |
| `inspectOperation` | Input schema, output schema, price | free |
| `runOperation` | Runs one endpoint (`wait` seconds inline, then poll) | paid |
| `getRun` | Status and result of a run | free |
| `getBalance` | Prepaid balance and minimum top-up | free |

Each tool is also exported on its own (`searchCatalog()`, `runOperation()` and so on). Options: `apiKey`, `baseUrl`, `fetch`, `timeoutMs`. `runOperation` also takes `requireApproval: true` to have the AI SDK ask before each paid run.

A resolved `runOperation` is not success. A bad input answers with `status: "failed"` and is not charged. Pass the same `idempotencyKey` to retry safely.

## Install

```bash
npm install github:loootai/looot-ai-sdk ai zod    # until the npm release
```

Peer dependencies: `ai` 6 or 7, `zod` 3.25.76+ or 4.1.8+. Node 22.18+.

## Develop

```bash
npm install
npm run typecheck && npm test && npm run build
npm run scan
git config core.hooksPath .githooks
```

## License

MIT. See [LICENSE](LICENSE).
