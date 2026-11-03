import type { components } from "./generated/openapi.js";

type Schemas = components["schemas"];
type Options = Schemas["InvoiceOptions"];

/** EN 16931 invoice, the `invoice` member of every create request. */
export type InvoiceDocument = Schemas["InvoiceDocument"];

/** Language of rendered labels and of the default texts the API fills in. Case-insensitive. */
export type Language = Schemas["PdfLanguage"];

/**
 * Extra national rule set checked on top of the invoice's profile.
 * "br-fr" is the French e-invoicing mandate's BR-FR rule set; it needs at least the BASIC profile.
 */
export type RuleSet = "br-fr";

/** Options for `createFacturX`. All optional. */
export interface FacturXOptions {
  /** Language of the rendered PDF and of default texts: "EN" (default), "DE" or "FR". */
  language?: Options["language"];
  /** Accent colour of the rendered PDF, as "#RRGGBB". */
  brandColor?: Options["brandColor"];
  /** Public PNG or JPEG URL of your logo, printed on the rendered PDF. */
  logoUrl?: Options["logoUrl"];
  /** Public URL of your own PDF to use as the visual layer instead of the built-in template. */
  pdfUrl?: Options["pdfUrl"];
  /** Adds an "Electronic invoice details" section listing the technical fields to the rendered PDF. */
  includeAdvancedProperties?: Options["includeAdvancedProperties"];
  /** Extra rule sets the created invoice must also pass, for example ["br-fr"]. */
  rules?: RuleSet[];
}

/** Options for `createCii`. All optional. */
export interface CiiOptions {
  /** Language of the default texts the API fills in when you leave them empty: "EN" (default), "DE" or "FR". */
  language?: Options["language"];
  /** Extra rule sets the created invoice must also pass, for example ["br-fr"]. */
  rules?: RuleSet[];
}

/**
 * UBL profile of `createUbl`, sent as given. It picks the CustomizationID stamped
 * into the XML and the rule set the invoice is validated against.
 */
export type UblProfile = "en16931" | "peppol-bis-3" | "nlcius" | "ehf" | "xrechnung" | "pint";

/** Options for `createUbl`. All optional. */
export interface UblOptions {
  /** UBL profile: "peppol-bis-3" (default), "en16931", "nlcius", "ehf", "xrechnung" or "pint". */
  profile?: UblProfile;
  /** Language of the default texts the API fills in when you leave them empty: "EN" (default), "DE" or "FR". */
  language?: Options["language"];
  /** Extra rule sets the created invoice must also pass, for example ["br-fr"]. */
  rules?: RuleSet[];
}

/** Options for `validateFacturX`. */
export interface ValidateOptions {
  /** Extra rule sets to check on top of the declared profile, for example ["br-fr"]. */
  rules?: RuleSet[];
}

/** Options for `embedFacturX`. */
export interface EmbedOptions {
  /** Only package the XML, without business-rule validation. Defaults to false. Cannot be combined with `rules`. */
  skipValidation?: boolean;
  /** Extra rule sets the XML must pass before it is embedded, for example ["br-fr"]. */
  rules?: RuleSet[];
}

/** Options for `renderXmlToPdf`. */
export interface RenderOptions {
  /** Language of the labels: "EN" (default), "DE" or "FR". */
  language?: Language;
  /** Public PNG or JPEG URL of a logo printed on the PDF. */
  logoUrl?: string;
  /** Prints the payment QR code (GiroCode) on the PDF. Defaults to false. */
  includeQrCode?: boolean;
}

/** Options for the convert methods that return XML. */
export interface ConvertOptions {
  /** Language of the findings when a conversion fails: "EN" (default), "DE" or "FR". */
  validationLanguage?: Language;
}

/** Options for the convert methods that return a Factur-X PDF. */
export interface ConvertToPdfOptions extends ConvertOptions {
  /** Language of the rendered PDF and of default texts the XML lacks: "EN" (default), "DE" or "FR". */
  language?: Language;
}

/** Options for `validateFacturXReport`. */
export interface ValidationReportOptions extends ValidateOptions {
  /** Language of the whole report: "EN" (default), "DE" or "FR". */
  validationLanguage?: Language;
}

/** Result of a validation report call. An invalid invoice is a normal result, so check `valid`. */
export interface ValidationReport {
  /** The printable PDF report. */
  file: Uint8Array;
  /** The verdict from the `X-Invoice-Valid` response header, or null when the header is missing. */
  valid: boolean | null;
}

/** Options for `transformToFacturX`. All optional. */
export interface TransformOptions {
  /**
   * Language of the rendered PDF and of default texts: "EN", "DE", "FR", or "auto"
   * (default) for the language the invoice is written in, English when that is none
   * of the three.
   */
  language?: Language | "auto";
  /** Keeps the uploaded PDF as the visual layer and only embeds the XML. Defaults to false. */
  preserveOriginalPdf?: boolean;
  /**
   * Ends the rendered PDF with an "Electronic invoice details" section listing the
   * technical fields. Defaults to true, set false for the classic layout. Ignored with
   * `preserveOriginalPdf`.
   */
  includeAdvancedProperties?: boolean;
  /** Language of the findings when the invoice is refused: "EN" (default), "DE" or "FR". */
  validationLanguage?: Language;
}

/**
 * The email that carries the invoice. `from` and `to` are required. The sender
 * must be on a domain added and verified on the Verified email domains page of
 * the dashboard.
 */
export interface EmailMessage {
  /** Sender address on one of your verified domains, for example "factures@example.com". */
  from: string;
  /** The recipient's address. One address. */
  to: string;
  /** Display name of the sender. */
  fromName?: string;
  /** Addresses that receive a visible copy. `cc` and `bcc` hold at most 2 addresses together. */
  cc?: string[];
  /** Addresses that receive a hidden copy. `cc` and `bcc` hold at most 2 addresses together. */
  bcc?: string[];
  /** Address the recipient's replies go to, when it differs from the sender. */
  replyTo?: string;
  /** Subject. Left out, the document type and its number are used. */
  subject?: string;
  /** Plain-text message, sent exactly as given. Left out, a short English text is sent. */
  message?: string;
}

/** Response of the email methods. No file comes back. */
export interface EmailSendResult {
  /** Always "accepted": handed over for delivery, not yet received by the recipient's server. */
  status: string;
  /** Identifier of the sent email. Keep it to ask about a delivery later. */
  messageId: string;
}

/** Response of `extractJson`. `invoice` can be passed straight back to `createFacturX`. */
export interface ExtractJsonResult {
  invoice: InvoiceDocument;
}

/**
 * How sure the AI read is, per area, from 0.0 (had to guess) to 1.0 (unambiguous).
 * A score is null when the area was not reported.
 */
export interface ParseConfidenceAreas {
  sellerIdentification: number | null;
  buyerIdentification: number | null;
  taxCalculation: number | null;
  /** Capped when the lines do not add up to the printed totals. */
  lineItems: number | null;
}

/** Confidence of a `parseJson` read. */
export interface ParseConfidence {
  /** Mean of the reported areas, from 0.0 to 1.0, or null when none was reported. */
  overall: number | null;
  areas: ParseConfidenceAreas;
}

/** Response of `parseJson`. A person must check `invoice` before it is used. */
export interface ParsedInvoice {
  invoice: InvoiceDocument;
  /** How sure the read is. Can be absent. */
  confidence?: ParseConfidence;
  /**
   * Lowercase ISO 639-1 code of the language the invoice is written in, for example "fr".
   * Any language can come back, so it is not always a valid `Language` for the create
   * and render methods. Absent when it could not be told.
   */
  language?: string;
}

/**
 * Result of a validation call. Valid and invalid documents both answer
 * HTTP 200, so check `valid`.
 */
export type ValidationResult = Schemas["ValidationResponse"];

/** One validation finding, from a validation result or from a rejected create or embed request. */
export type Finding = Schemas["ValidationFinding"];

/** One row of the field report: an invoice field with its value and its findings. */
export type ReportRow = Schemas["InvoiceReportRow"];

/** A finding attached to a row of the field report. */
export type ReportFinding = Schemas["InvoiceReportFinding"];

/** Error body of every non-2xx response (RFC 7807 problem details). */
export type ProblemDetails = Schemas["ApiProblemDetails"];

/**
 * A file to upload: the raw bytes (Buffer, Uint8Array, ArrayBuffer), a Blob or
 * File, or the document text as a string (for XML). PDF and XML are detected
 * from the content.
 */
export type FileInput = string | Uint8Array | ArrayBuffer | Blob;
