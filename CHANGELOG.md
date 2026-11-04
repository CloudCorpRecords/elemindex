# Changelog

## 0.1.0 (2026-10-27)

- First release: a forwarding client for the public Elements Live MCP server, serving all 9 captured tools locally for tools/list and forwarding every tools/call upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when issued).
- Tools: `research`, `get_element_ri`, `search_subjects`, `get_subject_ri`, `get_subject_history`, `get_subject_papers`, `get_element_papers`, `lab_quote`, `lab_run`.
- Upstream results pass through verbatim; upstream failures surface as `elemindex error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). Upstream endpoint overridable via `ELEMENTS_LIVE_MCP_URL`; when `ELEMENTS_LIVE_API_KEY` is set it is forwarded as a Bearer credential on every upstream request.
