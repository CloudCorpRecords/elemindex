/**
 * elemindex core: a forwarding client for the public
 * Elements Live MCP server.
 *
 * This module computes nothing locally. tools/list is
 * served from the literal tool definitions below, taken
 * verbatim from a live capture of the upstream server
 * (name, title, description and inputSchema exactly as
 * captured; the capture's annotations are not
 * reproduced). A tools/call is forwarded over a
 * streamable-HTTP JSON-RPC session: an initialize POST,
 * a notifications/initialized POST, then the tools/call
 * POST, honouring the Mcp-Session-Id response header
 * when the upstream issues one. The session is
 * established lazily on the first forwarded call and
 * reused for the lifetime of the client.
 *
 * The upstream endpoint defaults to
 * https://www.elements-live.com/mcp and can be
 * overridden with the ELEMENTS_LIVE_MCP_URL environment
 * variable (that override is a labelled reconstruction).
 * When the ELEMENTS_LIVE_API_KEY environment variable
 * is set, its value is sent as an
 * `Authorization: Bearer <key>` header on every upstream
 * request (that forwarding is a labelled reconstruction;
 * the capture itself was taken keyless). When it is not
 * set, no authorization header is sent. Some captured
 * tool descriptions say a tool requires a paid account
 * tier, or describe per-call payment without a key: that
 * is the upstream's own gating language, served verbatim,
 * and this rebuild adds no gating and no payment
 * machinery of its own.
 *
 * Upstream results pass through verbatim, including any
 * isError flag and any extra result fields. Failures —
 * a JSON-RPC error from the upstream, a non-2xx status,
 * an unparseable response, or a fetch that throws or
 * times out — surface as an isError result whose text
 * starts with `elemindex error:` (that rendering is a
 * labelled reconstruction). Responses may be plain JSON
 * or SSE (data: lines); the JSON-RPC message with the
 * matching id wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL =
  "https://www.elements-live.com/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/elements-live-tools-original.json)      */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "research",
    "title": "Research reading lists",
    "description": "CALL THIS FIRST for a literature question about chemistry, materials or physics research -- a broad one ('what matters in X') or a specific process or parameter one (a deposition condition, a property value, a defect mechanism). Send the question in plain words (q), or a paper you already know (paper: DOI or title). Returns reading lists in four lenses: relevant (the papers whose TITLE AND ABSTRACT best match the question, across the whole corpus, BM25 -- start here for a specific question), foundational (the classics the question's own papers cite most), now (highest impact, young papers' citations projected) and newest (last two years); plus the research communities and element sub-communities the question is about, with why each matched and whether it is rising. Put the question's key terms in q: filler words are ignored. unmatched_terms lists words that matched nothing; rephrase those. Each paper carries its DOI, a one-line reason and its abstract where one is on file. Our corpus is curated, not complete: the relevant lens also brings up to 3 of every 10 results from OpenAlex, marked source='openalex' and labelled not yet curated. One page = up to 10 papers per lens; ask for page 2+ only if needed. Requires a Personal+ account. Without a key, pay per call: $0.05 in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "lenses": {
          "description": "Default: all four.",
          "items": {
            "enum": [
              "relevant",
              "foundational",
              "now",
              "newest"
            ],
            "type": "string"
          },
          "type": "array"
        },
        "page": {
          "default": 1,
          "maximum": 5,
          "minimum": 1,
          "type": "integer",
          "description": "Result page number for paged paper results."
        },
        "page_size": {
          "default": 10,
          "description": "Papers per lens.",
          "maximum": 10,
          "minimum": 1,
          "type": "integer"
        },
        "paper": {
          "description": "Alternative to q: a DOI or title to start from.",
          "type": "string"
        },
        "q": {
          "description": "The research question, in plain words.",
          "type": "string"
        }
      },
      "type": "object"
    }
  },
  {
    "name": "get_element_ri",
    "title": "Element research intensity",
    "description": "Get current Research Intensity (RIS) for one of the 118 chemical elements, with a citation URL. No API key needed. Historical RI (HRI) is included with a Personal+ key.",
    "inputSchema": {
      "properties": {
        "symbol": {
          "description": "Element symbol, e.g. 'Fe' (a name like 'Iron' or an atomic number like '26' also works)",
          "type": "string"
        }
      },
      "required": [
        "symbol"
      ],
      "type": "object"
    }
  },
  {
    "name": "search_subjects",
    "title": "Search research subjects",
    "description": "Resolve a free-text query (a compound, material, or research topic) to its subject_type/subject_id for use with get_subject_ri. Free with any API key. Without a key, pay per call: $0.01 in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "query": {
          "type": "string",
          "description": "Free-text query naming a compound, material or research topic to resolve to a subject."
        }
      },
      "required": [
        "query"
      ],
      "type": "object"
    }
  },
  {
    "name": "get_subject_ri",
    "title": "Subject research intensity",
    "description": "Get RI, RIS, HRI and paper count for one research topic/keyword/sector. Requires a Personal+ account -- call search_subjects first to resolve subject_type/subject_id. Without a key, pay per call: $0.01 in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "subject_id": {
          "type": "string",
          "description": "Subject identifier, as returned by search_subjects."
        },
        "subject_type": {
          "enum": [
            "keyword",
            "sector"
          ],
          "type": "string",
          "description": "Kind of subject: keyword or sector."
        }
      },
      "required": [
        "subject_type",
        "subject_id"
      ],
      "type": "object"
    }
  },
  {
    "name": "get_subject_history",
    "title": "Subject research history",
    "description": "Full yearly (or monthly) RIS/HRI history for one topic/keyword/sector. Requires a Personal+ account. Without a key, pay per call: $0.10 in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "resolution": {
          "default": "yearly",
          "enum": [
            "yearly",
            "monthly"
          ],
          "type": "string",
          "description": "Time resolution of the history series: yearly or monthly."
        },
        "subject_id": {
          "type": "string",
          "description": "Subject identifier, as returned by search_subjects."
        },
        "subject_type": {
          "enum": [
            "keyword",
            "sector"
          ],
          "type": "string",
          "description": "Kind of subject: keyword or sector."
        }
      },
      "required": [
        "subject_type",
        "subject_id"
      ],
      "type": "object"
    }
  },
  {
    "name": "get_subject_papers",
    "title": "Top papers for a subject",
    "description": "The top papers for one research topic (resolve it with search_subjects first) -- title, DOI, venue, year, citations. Use it when asked what to READ about a specific topic, rather than how active it is. sort=impact (default) favours recent, well-cited work; sort=foundational gives the most-cited classics; sort=newest the latest. Each paper carries its abstract where one is on file (about 6 in 10). Requires a Personal+ account. Capped at 100 papers with no pagination. Without a key, pay per call: $0.02 for up to 20 papers, $0.10 for up to 100, in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "limit": {
          "default": 20,
          "maximum": 100,
          "type": "integer",
          "description": "Maximum number of top papers to return."
        },
        "sort": {
          "default": "impact",
          "description": "impact = citation-impact ranking (default); newest = most recently published first; foundational = most-cited first (the classics a reading list starts from).",
          "enum": [
            "impact",
            "newest",
            "foundational"
          ],
          "type": "string"
        },
        "subject_id": {
          "type": "string",
          "description": "Subject identifier, as returned by search_subjects."
        },
        "subject_type": {
          "enum": [
            "keyword",
            "sector"
          ],
          "type": "string",
          "description": "Kind of subject: keyword or sector."
        }
      },
      "required": [
        "subject_type",
        "subject_id"
      ],
      "type": "object"
    }
  },
  {
    "name": "get_element_papers",
    "title": "Top papers for an element",
    "description": "The top papers for one element, narrowed with keyword to one of its materials or applications (e.g. symbol='Al', keyword='aluminum nitride'; the keyword must name one of the element's topics exactly, case aside -- search_subjects finds topic names). Returns title, DOI, venue, year, citations. sort=impact (default) favours recent, well-cited work; sort=foundational gives the most-cited classics; sort=newest the latest. Each paper carries its abstract where one is on file (about 6 in 10). Requires a Personal+ account. Capped at 100 papers with no pagination. Without a key, pay per call: $0.02 for up to 20 papers, $0.10 for up to 100, in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "keyword": {
          "description": "Optional: narrow to one application keyword.",
          "type": "string"
        },
        "limit": {
          "default": 20,
          "maximum": 100,
          "type": "integer",
          "description": "Maximum number of top papers to return."
        },
        "sort": {
          "default": "impact",
          "description": "impact = citation-impact ranking (default); newest = most recently published first; foundational = most-cited first (the classics a reading list starts from).",
          "enum": [
            "impact",
            "newest",
            "foundational"
          ],
          "type": "string"
        },
        "symbol": {
          "description": "Element symbol, e.g. 'Fe' (a name like 'Iron' or an atomic number like '26' also works)",
          "type": "string"
        }
      },
      "required": [
        "symbol"
      ],
      "type": "object"
    }
  },
  {
    "name": "lab_quote",
    "title": "Lab: scope a filtered query",
    "description": "Scope a multi-term question with a boolean filter: +must -exclude \"exact topic\" (a OR b) wild* year:2015..2026, over element symbols or names and EXACT topic names (e.g. +Li +Co \"solid electrolyte\" -sulfide). Words that are neither are DROPPED, and wildcards can expand into unrelated fields: read `warnings` first -- it lists every dropped term with the nearest topics, every abbreviation read as a topic, and every wildcard expansion. Returns how many papers match, by year and by research community, the nearest broader query when nothing matches, and a quote_id that lab_run turns into the ranked papers. Narrow filters (two elements + one topic) work best. Requires a Professional+ account. Without a key, pay per call: $0.01 in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "markdown": {
          "description": "Alternative: markdown carrying the filter in a ```query fenced block.",
          "type": "string"
        },
        "query": {
          "description": "The filter, in the syntax above.",
          "type": "string"
        }
      },
      "type": "object"
    }
  },
  {
    "name": "lab_run",
    "title": "Lab: papers for a quote",
    "description": "Get the papers for a lab_quote: pass its quote_id and a depth (papers_20 or papers_100) to get the top papers matching the quoted filter, ranked by impact, with the curation behind each rank. Each paper carries its abstract where one is on file (about 6 in 10). A stale or expired quote is refused. Requires a Professional+ account. Without a key, pay per call: the quoted price of the depth, less the $0.01 quote credit in USDC on Base or Solana via x402 (send the payment in _meta[\"x402/payment\"]).",
    "inputSchema": {
      "properties": {
        "depth": {
          "default": "papers_20",
          "enum": [
            "papers_20",
            "papers_100"
          ],
          "type": "string",
          "description": "How many top papers to return: papers_20 (top 20) or papers_100 (top 100)."
        },
        "quote_id": {
          "description": "From lab_quote.",
          "type": "string"
        }
      },
      "required": [
        "quote_id"
      ],
      "type": "object"
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` is one of the captured tools. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `elemindex error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Parse a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * one is present, else the last parseable message, else
 * null when nothing parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON; ignore this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding one upstream session. The
 * session is established lazily on the first forwarded
 * call and reused for the lifetime of the client (the
 * process lifetime when the client is the MCP server's
 * or a one-shot client for the CLI).
 */
export class ElemindexClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).ELEMENTS_LIVE_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).ELEMENTS_LIVE_API_KEY;
    if (raw && raw !== "") return raw;
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) {
      headers["Authorization"] = `Bearer ${key}`;
    }
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "elemindex", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // The notification response body carries nothing we need.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Pass the upstream result through verbatim.
    return result;
  }
}

/** Create a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): ElemindexClient {
  return new ElemindexClient(deps);
}

/** One-shot helper: a fresh client per call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new ElemindexClient(deps).callTool(name, args);
}
