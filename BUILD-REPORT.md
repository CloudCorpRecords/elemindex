# BUILD REPORT — elemindex

Rebuild of `com.elements-live/elements-live` (remote-only, keyless capture)
as `@reneturcios/elemindex` 0.1.0 / `io.github.CloudCorpRecords/elemindex`.

## Fixture conflicts

**None between the brief, the spec prose, and the fixture on the tool
surface.** All three agree on all 9 tool names and every required field:

- `research` []; `get_element_ri` [symbol]; `search_subjects` [query];
  `get_subject_ri` [subject_type, subject_id];
  `get_subject_history` [subject_type, subject_id];
  `get_subject_papers` [subject_type, subject_id];
  `get_element_papers` [symbol]; `lab_quote` []; `lab_run` [quote_id].

Notes on points that look like conflicts but are resolved by the brief
itself, with the fixture governing in each case:

- For `research` and `lab_quote` the fixture's inputSchema carries no
  `required` key at all; that is served verbatim, and "required: none"
  in the brief/spec is the same fact in prose.
- Several captured descriptions carry upstream gating and payment
  language ("Requires a Personal+ account", "Requires a
  Professional+ account", and per-call USDC / x402 wording). Those
  strings are served verbatim as part of the fixture literals, exactly
  as the brief directs; the rebuild adds no gating and no payment
  machinery of its own.
- TEMPLATE.md §12 describes the generic fleet `src/mcp.ts` pattern as
  `McpServer` + zod. The brief for this forwarding build explicitly
  overrides that with the MCP SDK low-level `Server` API serving the
  fixture literals, which is what was built (the same pattern as the
  serieslib model build). No tool-surface deviation results.

The fixture's tool literals (name, title, description, inputSchema —
including enums, defaults, minimum/maximum bounds and nested keys) are
served verbatim from `src/forward.ts`. Captured annotations are not
reproduced, per the brief (parity compares inputSchema).

## What was built

All 19 factory files under `builds/elemindex/`:

- `package.json` (`@reneturcios/elemindex` 0.1.0, bin
  `elemindex` → `dist/cli.js`, deps exactly `@modelcontextprotocol/sdk ^1`
  + `zod ^3`; devDeps `@types/node ^20`, `tsx ^4`, `typescript ^5`)
- `server.json` (description exactly the prescribed 87-char string;
  npm entry carries `"version": "0.1.0"`; OCI entry
  `ghcr.io/cloudcorprecords/elemindex:0.1.0` carries **no** version field)
- `Dockerfile` (node:20-alpine both stages; server-name label matches
  `server.json`)
- `tsconfig.json` (fleet-identical, 318 bytes), `.gitignore`,
  `package-lock.json`, `README.md` (fresh prose), `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-27)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/forward.ts` (core; exports `VERSION = "0.1.0"`)
- `test/forward.test.ts`
- `.github/workflows/{ci.yml, publish.yml, publish-container.yml,
  registry-publish.yml}` (container workflow: IMAGE
  `ghcr.io/cloudcorprecords/elemindex`, smoke assertion on server name
  `elemindex`)

## Design

- Forwarding client to `https://www.elements-live.com/mcp` (pinned),
  overridable via `ELEMENTS_LIVE_MCP_URL` (labelled reconstruction).
  tools/call is forwarded as a streamable-HTTP JSON-RPC client:
  initialize (protocolVersion `2025-03-26`, clientInfo name
  `elemindex`) → notifications/initialized → tools/call, honouring
  `Mcp-Session-Id` when issued; session established lazily and reused
  per client. Plain-JSON and SSE replies both parsed; the
  matching-id message wins. Upstream results pass through verbatim
  (including `isError` and extra fields such as `structuredContent`).
- When `ELEMENTS_LIVE_API_KEY` is set, `Authorization: Bearer <key>`
  is sent on every upstream request (initialize, the initialized
  notification, and tools/call); when it is unset, no authorization
  header is sent (labelled reconstruction; the capture was keyless).
- Upstream failures (JSON-RPC error, non-2xx status, malformed body,
  throwing/timing-out fetch) surface as `elemindex error:` text
  results (labelled reconstruction).
- Registration via the MCP SDK **low-level** `Server` API
  (`ListToolsRequestSchema` / `CallToolRequestSchema` handlers) serving
  the fixture literals exactly; no `McpServer` + zod registration.
  `src/mcp.ts` also exports `createServer` / `startMcpServer` /
  `handleCallTool` so the MCP layer is testable without a transport;
  the CLI's `mcp` subcommand starts it over stdio. Unknown tools are
  rejected with McpError MethodNotFound and non-object arguments with
  McpError InvalidParams, before any network hop.
- Core takes an injectable fetch (`ForwardDeps.fetchFn`, plus
  `env` / `url` / `timeoutMs`, default timeout 30000 ms), so all tests
  run against a stubbed JSON-RPC upstream. No live network calls in
  tests; no live call claimed anywhere.

## Lockfile (Route 3, clean from birth)

Generated in a temp dir containing only the new `package.json`:
`npm install --package-lock-only --ignore-scripts --offline`.
Verified: parses, `name == @reneturcios/elemindex`, **128 package
entries**. The generated file was then copied into the build dir
(sha256 of the temp-dir original and the placed copy matched:
`277575c9e654458d24a819bf6364d910be9ed47842317915131c7ad492e75aea`).
Then `npm install --offline --ignore-scripts` in the build dir for
`node_modules`. No write-guard failure occurred; the /tmp staging
above was the Route 3 generation step itself, not a write-guard
fallback.

## Verification (all in the build dir)

- `npx tsc --noEmit` → exit 0
- `npm run build` → real `dist/` (cli.js 2338 B, forward.js 21272 B,
  mcp.js 2674 B, index.js 91 B, types.js 412 B, all non-empty, with
  `.d.ts` + source maps)
- `node dist/cli.js --version` → `0.1.0`; unknown subcommand → usage on
  stderr, exit 2
- `npm test` → **33 tests, 33 pass, 0 fail** (8 suites: registration
  integrity — served tools deep-equal the fixture's full 9 tool
  objects, names in order, required fields per tool; session
  establishment/reuse/session-id handling; env URL override plus
  Bearer header present on every request when the key is set and
  absent when unset; verbatim argument forwarding; verbatim result
  pass-through incl. upstream isError and SSE; JSON-RPC/init/
  malformed/HTTP/throw/timeout failures → `elemindex error:`;
  parseRpcBody; MCP-layer validation; CLI --version / unknown exit 2 /
  bad-JSON exit 2)
- Parity: `python3 harness/parity.py --original
  harness/fixtures/elements-live-tools-original.json --rebuild
  "stdio:node dist/cli.js mcp" --out parity-out` (run from the build
  dir with the harness/fixture paths absolute) → **PASS, parity 100.0,
  9/9 identical, no missing/extra/schema diffs** (see
  `parity-out/parity.json`)
- Consistency sweep: package.json version = server.json top-level =
  npm-entry version = OCI tag = core `VERSION` = CHANGELOG heading
  (0.1.0); package.json `mcpName` = server.json `name` = Dockerfile
  label; server.json description measured at 87 chars; OCI entry
  confirmed to have no `version` field.

Clean-room: all prose and code written fresh; only the fixture's tool
literals are served verbatim. Nothing published or pushed.
