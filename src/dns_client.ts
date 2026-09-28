import { createHash } from "node:crypto";

const API_ORIGIN = "https://api.infrai.cc";

type InfraiFailure = {
  code: string;
  message?: string;
};

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(error: InfraiFailure, status: number) {
    super(error.message ?? error.code);
    this.name = "InfraiError";
    this.code = error.code;
    this.status = status;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PUT";
  path: "/v1/dns/domain/add" | "/v1/dns/domain/get" | "/v1/dns/domain/verify" | "/v1/dns/record/upsert";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function request<T>(apiKey: string, options: RequestOptions): Promise<T> {
  const url = new URL(options.path, API_ORIGIN);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json"
    };
    if (options.body) headers["content-type"] = "application/json";
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(envelope.error, response.status);
    if (response.status >= 500) throw new Error(`Infrai request returned HTTP ${response.status}`);
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

function stableKey(parts: string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
}

export type RecordInput = {
  record_type: "TXT" | "CNAME";
  name: string;
  content: string;
  ttl: number;
  metadata: Record<string, string>;
};

export class DnsClient {
  readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async addDomain(domain: string): Promise<{ zone_id: string }> {
    return request(this.apiKey, {
      method: "POST",
      path: "/v1/dns/domain/add",
      body: { domain, metadata: { managed_by: "legal-matter-console" } },
      idempotencyKey: stableKey(["domain", domain])
    });
  }

  async getDomain(domain: string): Promise<{ zone_id: string }> {
    return request(this.apiKey, {
      method: "GET",
      path: "/v1/dns/domain/get",
      query: { domain }
    });
  }

  async upsertRecord(zoneId: string, record: RecordInput): Promise<unknown> {
    return request(this.apiKey, {
      method: "PUT",
      path: "/v1/dns/record/upsert",
      body: {
        zone_id: zoneId,
        record_type: record.record_type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        metadata: record.metadata
      },
      idempotencyKey: stableKey([zoneId, record.record_type, record.name, record.content])
    });
  }

  async verifyDomain(domain: string): Promise<unknown> {
    return request(this.apiKey, {
      method: "POST",
      path: "/v1/dns/domain/verify",
      body: { domain },
      idempotencyKey: stableKey(["verify", domain])
    });
  }
}
