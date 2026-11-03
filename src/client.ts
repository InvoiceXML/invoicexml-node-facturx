import { Http, type ClientOptions } from "./http.js";
import type {
  CiiOptions,
  ConvertOptions,
  ConvertToPdfOptions,
  EmailMessage,
  EmailSendResult,
  EmbedOptions,
  ExtractJsonResult,
  FacturXOptions,
  FileInput,
  InvoiceDocument,
  ParsedInvoice,
  RenderOptions,
  TransformOptions,
  UblOptions,
  ValidateOptions,
  ValidationReport,
  ValidationReportOptions,
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
   * Creates a plain UN/CEFACT CII XML invoice with the EN 16931 guideline ID, ready
   * to pass to `embedFacturX` together with your own PDF. Throws an `InvoiceXmlError`
   * with the violated rules in `errors` when the invoice would not be compliant.
   */
  async createCii(invoice: InvoiceDocument, options?: CiiOptions): Promise<string> {
    return (await this.http.postJson("/v1/create/cii", invoice, options)).text();
  }

  /**
   * Creates a UBL XML invoice. `profile` picks the CustomizationID and the rule set
   * the invoice is validated against; "peppol-bis-3" is the default. Throws an
   * `InvoiceXmlError` with the violated rules in `errors` when the invoice would not
   * be compliant.
   */
  async createUbl(invoice: InvoiceDocument, options?: UblOptions): Promise<string> {
    return (await this.http.postJson("/v1/create/ubl", invoice, options)).text();
  }

  /**
   * Validates a Factur-X PDF against the rule set of the profile its embedded
   * XML declares, plus any extra `rules`.
   */
  async validateFacturX(pdf: FileInput, options: ValidateOptions = {}): Promise<ValidationResult> {
    return json(await this.http.postFiles("/v1/validate/facturx", { file: pdf }, { rules: options.rules }));
  }

  /**
   * Validates a Factur-X PDF like `validateFacturX` and returns a printable PDF report
   * with the verdict in `valid`. An invalid invoice is a normal result, not an error.
   */
  async validateFacturXReport(pdf: FileInput, options: ValidationReportOptions = {}): Promise<ValidationReport> {
    const fields = { rules: options.rules, validationLanguage: options.validationLanguage };
    return report(await this.http.postFiles("/v1/validate/facturx/report", { file: pdf }, fields));
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
   * Renders any invoice XML as a human-readable PDF: CII (such as the XML of a Factur-X
   * invoice), UBL or XRechnung. The format is detected from the XML.
   */
  async renderXmlToPdf(xml: FileInput, options: RenderOptions = {}): Promise<Uint8Array> {
    const fields = { language: options.language, logoUrl: options.logoUrl, includeQrCode: options.includeQrCode };
    return bytes(await this.http.postFiles("/v1/render/xml/to/pdf", { file: xml }, fields));
  }

  /** Converts a Factur-X PDF into UBL XML. */
  async convertFacturXToUbl(pdf: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/facturx/to/ubl", pdf, options);
  }

  /** Converts a Factur-X PDF into CII XML. */
  async convertFacturXToCii(pdf: FileInput, options: ConvertOptions = {}): Promise<string> {
    return this.convertToXml("/v1/convert/facturx/to/cii", pdf, options);
  }

  /** Converts a CII XML into a Factur-X PDF/A-3 with a PDF rendered from the invoice. */
  async convertCiiToFacturX(xml: FileInput, options: ConvertToPdfOptions = {}): Promise<Uint8Array> {
    return this.convertToPdf("/v1/convert/cii/to/facturx", xml, options);
  }

  /** Converts a UBL XML into a Factur-X PDF/A-3 with a PDF rendered from the invoice. */
  async convertUblToFacturX(xml: FileInput, options: ConvertToPdfOptions = {}): Promise<Uint8Array> {
    return this.convertToPdf("/v1/convert/ubl/to/facturx", xml, options);
  }

  /** Converts an XRechnung XML (UBL or CII) into a Factur-X PDF/A-3 with a PDF rendered from the invoice. */
  async convertXRechnungToFacturX(xml: FileInput, options: ConvertToPdfOptions = {}): Promise<Uint8Array> {
    return this.convertToPdf("/v1/convert/xrechnung/to/facturx", xml, options);
  }

  /**
   * Reads a PDF invoice and returns a Factur-X PDF/A-3. AI reads the PDF, so a person
   * must check the result before it is used. Throws an `InvoiceXmlError` with the
   * violated rules in `errors` when the data read would not be compliant. A 429 on this
   * method is not retried automatically, so wait for `Retry-After` before calling again
   * if you want to retry.
   */
  async transformToFacturX(pdf: FileInput, options: TransformOptions = {}): Promise<Uint8Array> {
    const fields = {
      language: options.language,
      preserveOriginalPdf: options.preserveOriginalPdf,
      includeAdvancedProperties: options.includeAdvancedProperties,
      validationLanguage: options.validationLanguage,
    };
    return bytes(await this.http.postFiles("/v1/transform/to/facturx", { file: pdf }, fields, { retryRateLimit: false }));
  }

  /**
   * Reads a Factur-X PDF or a CII XML into invoice data. Deterministic: the XML
   * is parsed, no AI is involved.
   */
  async extractJson(file: FileInput): Promise<ExtractJsonResult> {
    return json(await this.http.postFiles("/v1/extract/json", { file }));
  }

  /**
   * Reads `pdf`, a PDF invoice (typed, scanned or photographed), into invoice data.
   * AI reads the PDF, so a person must check the data before it is used. XML embedded
   * in the PDF is ignored: use `extractJson` to read it. `confidence` scores the read
   * from 0.0 (had to guess) to 1.0 (unambiguous) and `language` is the ISO 639-1 code
   * of the invoice's language; both can be absent. A 429 on this method is not retried
   * automatically, so wait for `Retry-After` before calling again if you want to retry.
   */
  async parseJson(pdf: FileInput): Promise<ParsedInvoice> {
    return json(await this.http.postFiles("/v1/parse/json", { file: pdf }, {}, { retryRateLimit: false }));
  }

  /** Extracts the supporting documents attached to an invoice as a ZIP archive. */
  async extractAttachments(file: FileInput): Promise<Uint8Array> {
    return bytes(await this.http.postFiles("/v1/extract/attachments", { file }));
  }

  private async convertToXml(path: string, file: FileInput, options: ConvertOptions): Promise<string> {
    const fields = { validationLanguage: options.validationLanguage };
    return (await this.http.postFiles(path, { file }, fields)).text();
  }

  private async convertToPdf(path: string, file: FileInput, options: ConvertToPdfOptions): Promise<Uint8Array> {
    const fields = { language: options.language, validationLanguage: options.validationLanguage };
    return bytes(await this.http.postFiles(path, { file }, fields));
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

async function report(response: Response): Promise<ValidationReport> {
  const verdict = response.headers.get("X-Invoice-Valid");
  return { file: await bytes(response), valid: verdict === "true" ? true : verdict === "false" ? false : null };
}
