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

/** Response of `extractJson`. `invoice` can be passed straight back to `createFacturX`. */
export interface ExtractJsonResult {
  invoice: InvoiceDocument;
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
