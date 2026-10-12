import { InvoiceXmlError, TooManyRequestsError } from "./errors.js";
import type { FileInput, ProblemDetails } from "./types.js";

export interface ClientOptions {
  /** API key from https://www.invoicexml.com/account/authentication. */
  apiKey: string;
  /** Defaults to https://api.invoicexml.com. */
  baseUrl?: string;
  /** How often a 429 is retried after waiting Retry-After seconds. Defaults to 3. 0 disables retries. */
  maxRetries?: number;
  /** Request timeout in milliseconds. Defaults to 120000. */
  timeoutMs?: number;
  /** Custom fetch implementation. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const MAX_RETRY_AFTER_SECONDS = 120;

/** Shared transport: auth header, JSON and multipart bodies, 429 retries, error mapping. */
export class Http {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    options: ClientOptions,
    private readonly userAgent: string,
  ) {
    if (!options?.apiKey?.trim()) throw new TypeError("An InvoiceXML API key is required.");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.invoicexml.com").replace(/\/+$/, "");
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  postJson(path: string, invoice: unknown, options?: object): Promise<Response> {
    const body: Record<string, unknown> = { invoice };
    if (options && Object.keys(options).length > 0) body.options = options;
    return this.send(path, JSON.stringify(body), "application/json");
  }

  async postFiles(
    path: string,
    files: Record<string, FileInput>,
    fields: Record<string, string | boolean | readonly string[] | undefined> = {},
  ): Promise<Response> {
    const form = new FormData();
    for (const [name, input] of Object.entries(files)) {
      const { blob, filename } = await toUpload(input, name);
      form.append(name, blob, filename);
    }
    for (const [name, value] of Object.entries(fields)) {
      if (Array.isArray(value)) for (const item of value) form.append(name, item);
      else if (value !== undefined) form.append(name, String(value));
    }
    return this.send(path, form);
  }

  private async send(path: string, body: string | FormData, contentType?: string): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "*/*",
      "User-Agent": this.userAgent,
    };
    if (contentType) headers["Content-Type"] = contentType;

    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchFn(this.baseUrl + path, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status === 429 && attempt < this.maxRetries) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, retryAfter(response) * 1000));
        continue;
      }
      if (response.ok) return response;

      const text = await response.text();
      let parsed: ProblemDetails | string = text;
      try {
        const json: unknown = JSON.parse(text);
        if (json && typeof json === "object" && !Array.isArray(json)) parsed = json as ProblemDetails;
      } catch {
        // Not JSON: keep the text.
      }
      if (response.status === 429) throw new TooManyRequestsError(parsed, retryAfter(response));
      throw new InvoiceXmlError(response.status, parsed);
    }
  }
}

function retryAfter(response: Response): number {
  const header = response.headers.get("Retry-After")?.trim() ?? "";
  let seconds = 1;
  if (/^\d+$/.test(header)) seconds = Number(header);
  else if (header && !Number.isNaN(Date.parse(header))) {
    seconds = Math.ceil((Date.parse(header) - Date.now()) / 1000);
  }
  return Math.max(0, Math.min(seconds, MAX_RETRY_AFTER_SECONDS));
}

/** The API tells PDF from XML by content type or file extension, so label each upload from its content. */
async function toUpload(input: FileInput, field: string): Promise<{ blob: Blob; filename: string }> {
  let head: Uint8Array;
  if (input instanceof Blob) head = new Uint8Array(await input.slice(0, 1024).arrayBuffer());
  else if (typeof input === "string") head = new TextEncoder().encode(input.slice(0, 1024));
  else head = (input instanceof Uint8Array ? input : new Uint8Array(input)).subarray(0, 1024);

  const isPdf = new TextDecoder("latin1").decode(head).includes("%PDF-");
  const type = isPdf ? "application/pdf" : "application/xml";
  const named = "name" in Object(input) ? (input as { name?: unknown }).name : undefined;
  const filename =
    typeof named === "string" && named ? named : `${field === "file" ? "document" : "invoice"}.${isPdf ? "pdf" : "xml"}`;

  const blob =
    input instanceof Blob
      ? new Blob([input], { type: input.type || type })
      : new Blob([input as BlobPart], { type });
  return { blob, filename };
}
