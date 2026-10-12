import { Http, type ClientOptions } from "./http.js";
import type {
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

async function bytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
