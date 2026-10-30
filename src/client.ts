import { Http, type ClientOptions } from "./http.js";
import type {
  EmailMessage,
  EmailSendResult,
  EmbedOptions,
  ExtractJsonResult,
  FacturXOptions,
  FileInput,
  InvoiceDocument,
  ValidateOptions,
  ValidationResult,
} from "./types.js";
import { VERSION } from "./version.js";

/**
 * Thin client for the Factur-X endpoints of the InvoiceXML API.
 *
 * Invoices use the EN 16931 shape of the API's InvoiceDocument schema. The API
 * computes totals and the VAT breakdown, builds the XML, and validates every
 * document before delivering it. Use it from server-side code only: the API key
 * must never reach a browser.
 */
export class FacturXClient {
  private readonly http: Http;

  constructor(options: ClientOptions) {
    this.http = new Http(options, `invoicexml-node-facturx/${VERSION}`);
  }

  /**
   * Creates a Factur-X hybrid invoice: a PDF/A-3 with the CII XML embedded as
   * factur-x.xml. EN 16931 is the default profile; set `specificationId` to one
   * of `FacturXProfiles` for another. Throws an `InvoiceXmlError` with the
   * violated rules in `errors` when the invoice would not be compliant.
   */
  async createFacturX(invoice: InvoiceDocument, options?: FacturXOptions): Promise<Uint8Array> {
    return bytes(await this.http.postJson("/v1/create/facturx", invoice, options));
  }

  /**
   * Validates a Factur-X PDF against the rule set of the profile its embedded
   * XML declares, plus any extra `rules`.
   */
  async validateFacturX(pdf: FileInput, options: ValidateOptions = {}): Promise<ValidationResult> {
    return json(await this.http.postFiles("/v1/validate/facturx", { file: pdf }, { rules: options.rules }));
  }

  /**
   * Embeds an existing CII XML into an existing PDF and returns a Factur-X PDF/A-3.
   * The XML is validated before embedding unless `skipValidation` is true.
   */
  async embedFacturX(pdf: FileInput, xml: FileInput, options: EmbedOptions = {}): Promise<Uint8Array> {
    const fields = { skipValidation: options.skipValidation || undefined, rules: options.rules };
    return bytes(await this.http.postFiles("/v1/embed/facturx", { pdf, xml }, fields));
  }

  /**
   * Creates a Factur-X invoice like `createFacturX` and sends it as a real email
   * from your own verified domain. Returns the message id, not the file. A
   * non-compliant invoice throws an `InvoiceXmlError` and is not sent.
   */
  async emailFacturX(invoice: InvoiceDocument, email: EmailMessage, options?: FacturXOptions): Promise<EmailSendResult> {
    return json(await this.http.postJson("/v1/create/facturx/email", invoice, options, normalizeEmail(email)));
  }

  /**
   * Embeds an existing CII XML into an existing PDF like `embedFacturX` and sends
   * the Factur-X PDF/A-3 as a real email from your own verified domain. Returns the
   * message id, not the file. The XML is always validated before sending, plus any
   * extra `rules`.
   */
  async emailEmbeddedFacturX(
    pdf: FileInput,
    xml: FileInput,
    email: EmailMessage,
    options: Pick<EmbedOptions, "rules"> = {},
  ): Promise<EmailSendResult> {
    const fields = { ...emailFields(email), rules: options.rules };
    return json(await this.http.postFiles("/v1/embed/facturx/email", { pdf, xml }, fields));
  }

  /**
   * Reads a Factur-X PDF or a CII XML into invoice data. Deterministic: the XML
   * is parsed, no AI is involved.
   */
  async extractJson(file: FileInput): Promise<ExtractJsonResult> {
    return json(await this.http.postFiles("/v1/extract/json", { file }));
  }

  /** Extracts the supporting documents attached to an invoice as a ZIP archive. */
  async extractAttachments(file: FileInput): Promise<Uint8Array> {
    return bytes(await this.http.postFiles("/v1/extract/attachments", { file }));
  }
}

const SINGLE_VALUE_EMAIL_FIELDS = ["from", "fromName", "to", "replyTo", "subject", "message"] as const;

/**
 * The same rules for the JSON and the form routes, also for JavaScript callers: a
 * list is refused in a single-value field, because a form route would lose all but
 * its first item. `cc` and `bcc` take one address or a list, without blank entries.
 */
function normalizeEmail(email: EmailMessage): EmailMessage {
  for (const field of SINGLE_VALUE_EMAIL_FIELDS) {
    if (Array.isArray(email[field])) {
      throw new TypeError(`email.${field} takes a single value. Only cc and bcc take a list.`);
    }
  }
  const { cc, bcc, ...normalized } = email;
  return { ...normalized, cc: copyAddresses(cc), bcc: copyAddresses(bcc) };
}

function copyAddresses(addresses: string | string[] | null | undefined): string[] | undefined {
  const kept = [addresses]
    .flat()
    .flatMap((address) => (typeof address === "string" && address.trim() ? [address.trim()] : []));
  return kept.length > 0 ? kept : undefined;
}

function emailFields(email: EmailMessage) {
  const normalized = normalizeEmail(email);
  return {
    "email.from": normalized.from,
    "email.fromName": normalized.fromName,
    "email.to": normalized.to,
    "email.cc": normalized.cc,
    "email.bcc": normalized.bcc,
    "email.replyTo": normalized.replyTo,
    "email.subject": normalized.subject,
    "email.message": normalized.message,
  };
}

async function bytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
