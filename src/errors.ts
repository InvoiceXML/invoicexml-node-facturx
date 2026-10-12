import type { Finding, ProblemDetails } from "./types.js";

/**
 * Thrown when the API answers with an error status. When a create or embed
 * request is refused because the invoice would not be compliant (HTTP 400),
 * `errors` lists the violated rules.
 * Error codes: https://www.invoicexml.com/docs/error-handling
 */
export class InvoiceXmlError extends Error {
  readonly status: number;
  readonly title: string | null;
  readonly detail: string | null;
  /** Stable numeric error code. */
  readonly errorCode: number | null;
  readonly errors: Finding[];
  readonly warnings: Finding[];
  /** Correlation id of the request, to quote when contacting support. */
  readonly traceId: string | null;
  /** The decoded response body: a problem details object, or the raw text when the body was not JSON. */
  readonly body: ProblemDetails | string;

  constructor(status: number, body: ProblemDetails | string) {
    const problem: Partial<ProblemDetails> = body && typeof body === "object" ? body : {};
    const title = typeof problem.title === "string" ? problem.title : null;
    const detail =
      typeof problem.detail === "string" ? problem.detail : typeof body === "string" && body ? body : null;
    let message = `InvoiceXML API error ${status}`;
    if (title) message += `: ${title}`;
    if (detail && detail !== title) message += ` (${detail})`;
    super(message);
    this.name = "InvoiceXmlError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    const code = Number(problem.errorCode);
    this.errorCode = problem.errorCode != null && Number.isInteger(code) ? code : null;
    this.errors = Array.isArray(problem.errors) ? problem.errors : [];
    this.warnings = Array.isArray(problem.warnings) ? problem.warnings : [];
    this.traceId = typeof problem.traceId === "string" ? problem.traceId : null;
    this.body = body;
  }
}

/**
 * Thrown on HTTP 429 once the automatic retries are used up. A request answered
 * with 429 was not processed and not billed, so it is safe to resend.
 */
export class TooManyRequestsError extends InvoiceXmlError {
  /** Seconds to wait before retrying, from the Retry-After header. */
  readonly retryAfter: number;

  constructor(body: ProblemDetails | string, retryAfter: number) {
    super(429, body);
    this.name = "TooManyRequestsError";
    this.retryAfter = retryAfter;
  }
}
