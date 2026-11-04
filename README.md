# elemindex

elemindex is a thin local bridge to the Elements Live
hosted MCP server, a research index that tracks how
much attention each of the 118 chemical elements — and
a wider set of research subjects such as compounds,
materials and topics — is getting in the literature,
and which papers sit behind those numbers.

The bridge holds no data and computes nothing. It
serves the upstream server's tool list locally —
exactly as captured from the live endpoint — and
forwards each tool call upstream, returning the result
untouched. A few upstream tools are free, while others
are described upstream as requiring a paid account
tier; that gating is the upstream's own, stated in the
tool descriptions themselves. This client adds no
gating and no payment machinery: it optionally forwards
one credential, described under Configuration, and
otherwise sends no credential of its own.

## Tools

- `research` — the literature entry point. Ask a broad
  or specific chemistry, materials or physics question
  in plain words (`q`), or start from a known paper
  (`paper`: a DOI or title). Reading lists come back in
  four lenses — `relevant`, `foundational`, `now` and
  `newest` — controlled with `lenses`, plus `page` and
  `page_size` for paging. No argument is required by the
  schema.
- `get_element_ri` — the current Research Intensity
  (RIS) for one element, with a citation URL. Required:
  `symbol` — a symbol such as `Fe`, a name such as
  `Iron`, or an atomic number also work.
- `search_subjects` — resolve a free-text query (a
  compound, material or research topic) to the
  `subject_type` / `subject_id` pair the subject tools
  need. Required: `query`.
- `get_subject_ri` — RI, RIS, HRI and paper count for
  one research topic, keyword or sector. Required:
  `subject_type` (`keyword` or `sector`) and
  `subject_id`; resolve both with `search_subjects`
  first.
- `get_subject_history` — the full RIS/HRI history for
  one subject, at `yearly` resolution by default or
  `monthly` when asked. Required: `subject_type` and
  `subject_id`.
- `get_subject_papers` — the top papers for one subject:
  title, DOI, venue, year and citations. Required:
  `subject_type` and `subject_id`. Optional: `limit`
  (default 20, capped at 100) and `sort` (`impact`,
  `newest` or `foundational`).
- `get_element_papers` — the top papers for one element,
  optionally narrowed with `keyword` to one of that
  element's materials or applications. Required:
  `symbol`. Optional: `limit` and `sort`, as above.
- `lab_quote` — scope a multi-term question with a
  boolean filter (`query`, or `markdown` carrying the
  filter in a fenced block). Returns match counts and a
  `quote_id`; read its `warnings` before trusting the
  filter, since unsupported terms are dropped. No
  argument is required by the schema.
- `lab_run` — turn a `lab_quote` result into its ranked
  papers. Required: `quote_id`. Optional: `depth`
  (`papers_20` by default, or `papers_100`).

## Configuration

- `ELEMENTS_LIVE_MCP_URL` (optional) — override the
  upstream endpoint. Defaults to
  `https://www.elements-live.com/mcp`.
  (The override hook is this rebuild's own labelled
  reconstruction.)
- `ELEMENTS_LIVE_API_KEY` (optional) — when set, its
  value is sent as `Authorization: Bearer <key>` on
  every upstream request. When it is not set, no
  authorization header is sent at all. (This forwarding
  is this rebuild's own labelled reconstruction; the
  original capture was taken keyless.)

### Forwarding mechanics

On the first tool call the client opens a streamable
HTTP session with the upstream: a JSON-RPC `initialize`
request (protocolVersion `2025-03-26`, clientInfo name
`elemindex`), then a `notifications/initialized`
notification, then the `tools/call` request carrying
the caller's arguments unchanged. When the upstream
answers `initialize` with an `Mcp-Session-Id` header,
that value rides on every later request of the
session, which is reused for the life of the process.
Replies may arrive as plain JSON or as
server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `elemindex error:` (this rendering is
this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string (omit it for tools that take none):

```bash
npx @reneturcios/elemindex get_element_ri '{"symbol":"Fe"}'
npx @reneturcios/elemindex search_subjects '{"query":"solid electrolyte"}'
npx @reneturcios/elemindex research
npx @reneturcios/elemindex --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/elemindex mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "elemindex": {
      "command": "npx",
      "args": ["-y", "@reneturcios/elemindex", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/elemindex
docker run --rm ghcr.io/cloudcorprecords/elemindex --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
