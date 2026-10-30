import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FacturXClient,
  FacturXProfiles,
  InvoiceXmlError,
  TooManyRequestsError,
  VERSION,
  type EmailMessage,
  type EmbedOptions,
  type InvoiceDocument,
} from "../src/index.js";

const invoice: InvoiceDocument = {
  invoiceNumber: "FA-2026-0042",
  issueDate: "2026-09-01",
  currency: "EUR",
  seller: {
    name: "Atelier Numerique SARL",
    vatIdentifier: "FR32123456789",
    legalRegistration: { identifier: "123456789", schemeId: "0002" },
    postalAddress: { line1: "18 Rue de la Republique", city: "Lyon", postCode: "69002", country: "FR" },
  },
  buyer: {
    name: "Librairie Grand Siecle SAS",
    postalAddress: { line1: "5 Boulevard Saint-Germain", city: "Paris", postCode: "75005", country: "FR" },
  },
  paymentDetails: { paymentAccountIdentifier: "FR7630006000011234567890189" },
  lines: [
    { quantity: 12, item: { name: "Maintenance applicative" }, priceDetails: { netPrice: 180 }, vatInformation: { rate: 20 } },
  ],
};

const PDF = new TextEncoder().encode("%PDF-1.7\n%binary\n");
const XML = '<?xml version="1.0"?><rsm:CrossIndustryInvoice/>';

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function client(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) {
  return new FacturXClient({ apiKey: "test-key", fetch, ...extra });
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const headers = (call: Call) => call.init.headers as Record<string, string>;
const form = (call: Call) => call.init.body as FormData;
const fieldNames = (call: Call) => {
  const names: string[] = [];
  form(call).forEach((_, name) => names.push(name));
  return names;
};

const verdict = {
  valid: true,
  detail: "Valid Factur-X.",
  data: { hasEmbeddedXml: true, schemaValid: true, schematronValid: true, conformanceLevel: "EN16931", profile: "en16931", customizationId: null },
  errors: [],
  warnings: [],
  report: [],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("construction", () => {
  it("requires an API key", () => {
    expect(() => new FacturXClient({ apiKey: "" })).toThrow(/API key/);
  });

  it("keeps VERSION in sync with package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});

describe("createFacturX", () => {
  it("posts the invoice envelope with bearer auth and returns the PDF bytes", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF, { headers: { "Content-Type": "application/pdf" } }));
    const pdf = await client(fetch).createFacturX(invoice, { language: "FR", rules: ["br-fr"] });

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    const call = calls[0]!;
    expect(call.url).toBe("https://api.invoicexml.com/v1/create/facturx");
    expect(call.init.method).toBe("POST");
    expect(headers(call).Authorization).toBe("Bearer test-key");
    expect(headers(call)["Content-Type"]).toBe("application/json");
    expect(headers(call)["User-Agent"]).toBe(`invoicexml-node-facturx/${VERSION}`);
    expect(JSON.parse(call.init.body as string)).toEqual({ invoice, options: { language: "FR", rules: ["br-fr"] } });
  });

  it("omits options when none are given and passes a profile through specificationId", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch).createFacturX({ ...invoice, specificationId: FacturXProfiles.BASIC });
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.options).toBeUndefined();
    expect(body.invoice.specificationId).toBe("urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic");
  });

  it("throws an InvoiceXmlError carrying the violated rules on 400", async () => {
    const problem = {
      title: "Invoice validation failed",
      detail: "The invoice violates 1 rule.",
      status: 400,
      errorCode: 4001,
      traceId: "00-abc-01",
      errors: [{ rule: "BR-FR-05", layer: "cius", line: null, message: "Mention PMT manquante.", fields: ["notes"], raw: null }],
      warnings: [],
    };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const e = (await client(fetch).createFacturX(invoice, { rules: ["br-fr"] }).catch((x: unknown) => x)) as InvoiceXmlError;

    expect(e).toBeInstanceOf(InvoiceXmlError);
    expect(e.status).toBe(400);
    expect(e.errorCode).toBe(4001);
    expect(e.traceId).toBe("00-abc-01");
    expect(e.errors[0]!.rule).toBe("BR-FR-05");
    expect(e.message).toBe("InvoiceXML API error 400: Invoice validation failed (The invoice violates 1 rule.)");
  });

  it("maps a non-JSON error body to the detail", async () => {
    const { fetch } = mockFetch(new Response("upstream unavailable", { status: 502 }));
    const e = (await client(fetch).createFacturX(invoice).catch((x: unknown) => x)) as InvoiceXmlError;
    expect(e.status).toBe(502);
    expect(e.detail).toBe("upstream unavailable");
    expect(e.errors).toEqual([]);
  });
});

describe("uploads", () => {
  it("validates a Factur-X PDF as a multipart file labelled application/pdf", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(verdict));
    const result = await client(fetch).validateFacturX(PDF);

    expect(result.valid).toBe(true);
    expect(result.data.profile).toBe("en16931");
    const call = calls[0]!;
    expect(call.url).toBe("https://api.invoicexml.com/v1/validate/facturx");
    expect(headers(call)["Content-Type"]).toBeUndefined();
    const body = form(call);
    const file = body.get("file") as File;
    expect(file.type).toBe("application/pdf");
    expect(file.name).toBe("document.pdf");
    expect(body.has("rules")).toBe(false);
  });

  it("sends each extra rule set as a repeated rules field", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ ...verdict, valid: false }));
    await client(fetch).validateFacturX(new Blob([PDF]), { rules: ["br-fr"] });
    expect(form(calls[0]!).getAll("rules")).toEqual(["br-fr"]);
  });

  it("embeds with pdf and xml parts, skipValidation and rules", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF), new Response(PDF));
    await client(fetch).embedFacturX(PDF, Buffer.from(XML), { skipValidation: true });
    await client(fetch).embedFacturX(PDF.buffer as ArrayBuffer, XML, { rules: ["br-fr"] });

    const first = form(calls[0]!);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/embed/facturx");
    expect((first.get("pdf") as File).name).toBe("invoice.pdf");
    expect((first.get("xml") as File).type).toBe("application/xml");
    expect(first.get("skipValidation")).toBe("true");
    expect(first.has("rules")).toBe(false);
    const second = form(calls[1]!);
    expect(second.has("skipValidation")).toBe(false);
    expect(second.getAll("rules")).toEqual(["br-fr"]);
  });

  it("extracts invoice JSON and attachments", async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const { fetch, calls } = mockFetch(jsonResponse({ invoice }), new Response(zip));
    const extracted = await client(fetch).extractJson(PDF);
    const attachments = await client(fetch).extractAttachments(XML);

    expect(extracted.invoice.invoiceNumber).toBe("FA-2026-0042");
    expect(Array.from(attachments)).toEqual(Array.from(zip));
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.invoicexml.com/v1/extract/json",
      "https://api.invoicexml.com/v1/extract/attachments",
    ]);
  });
});

describe("render", () => {
  it("sends every option to /v1/render/cii/to/pdf", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const pdf = await client(fetch).renderCiiToPdf(XML, { language: "FR", logoUrl: "https://example.com/logo.png", includeQrCode: true });

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/render/cii/to/pdf");
    const body = form(calls[0]!);
    expect((body.get("file") as File).type).toBe("application/xml");
    expect(body.get("language")).toBe("FR");
    expect(body.get("logoUrl")).toBe("https://example.com/logo.png");
    expect(body.get("includeQrCode")).toBe("true");
  });

  it("omits unset options and sends an explicit includeQrCode false", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF), new Response(PDF));
    await client(fetch).renderCiiToPdf(XML);
    await client(fetch).renderCiiToPdf(XML, { includeQrCode: false });

    expect(fieldNames(calls[0]!)).toEqual(["file"]);
    expect(form(calls[1]!).get("includeQrCode")).toBe("false");
  });
});

describe("convert", () => {
  it.each([
    ["convertFacturXToUbl", "facturx/to/ubl"],
    ["convertFacturXToCii", "facturx/to/cii"],
  ] as const)("%s posts to /v1/convert/%s and returns the XML as text", async (method, route) => {
    const { fetch, calls } = mockFetch(new Response(XML), new Response(XML));
    const xml = await client(fetch)[method](PDF, { validationLanguage: "FR" });
    await client(fetch)[method](PDF);

    expect(xml).toBe(XML);
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/convert/${route}`);
    expect(fieldNames(calls[0]!)).toEqual(["file", "validationLanguage"]);
    expect(form(calls[0]!).get("validationLanguage")).toBe("FR");
    expect(fieldNames(calls[1]!)).toEqual(["file"]);
  });

  it.each([
    ["convertCiiToFacturX", "cii/to/facturx"],
    ["convertUblToFacturX", "ubl/to/facturx"],
    ["convertXRechnungToFacturX", "xrechnung/to/facturx"],
  ] as const)("%s posts to /v1/convert/%s and returns the PDF bytes", async (method, route) => {
    const { fetch, calls } = mockFetch(new Response(PDF), new Response(PDF));
    const pdf = await client(fetch)[method](XML, { language: "FR", validationLanguage: "DE" });
    await client(fetch)[method](XML);

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe(`https://api.invoicexml.com/v1/convert/${route}`);
    expect(form(calls[0]!).get("language")).toBe("FR");
    expect(form(calls[0]!).get("validationLanguage")).toBe("DE");
    expect(fieldNames(calls[1]!)).toEqual(["file"]);
  });

  it("surfaces a failed conversion through InvoiceXmlError", async () => {
    const problem = { title: "No embedded XML", status: 400, errorCode: 4006, errors: [], warnings: [] };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).convertFacturXToUbl(PDF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    expect((error as InvoiceXmlError).errorCode).toBe(4006);
  });
});

describe("validation report", () => {
  const reportResponse = (headers?: Record<string, string>) => new Response(PDF, { headers });

  it("posts to /v1/validate/facturx/report and returns the file and verdict", async () => {
    const { fetch, calls } = mockFetch(reportResponse({ "X-Invoice-Valid": "true" }));
    const report = await client(fetch).validateFacturXReport(PDF, { validationLanguage: "FR" });

    expect(report.valid).toBe(true);
    expect(Array.from(report.file)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/validate/facturx/report");
    expect((form(calls[0]!).get("file") as File).type).toBe("application/pdf");
    expect(form(calls[0]!).get("validationLanguage")).toBe("FR");
  });

  it("sends one rules part per rule set", async () => {
    const { fetch, calls } = mockFetch(reportResponse({ "X-Invoice-Valid": "true" }));
    await client(fetch).validateFacturXReport(PDF, { rules: ["br-fr", "br-fr"] });
    expect(form(calls[0]!).getAll("rules")).toEqual(["br-fr", "br-fr"]);
  });

  it("returns a failed verdict as a normal result", async () => {
    const { fetch } = mockFetch(reportResponse({ "X-Invoice-Valid": "false" }));
    const report = await client(fetch).validateFacturXReport(PDF, { rules: ["br-fr"] });
    expect(report.valid).toBe(false);
    expect(report.file.byteLength).toBe(PDF.byteLength);
  });

  it("returns null when the verdict header is missing and omits unset options", async () => {
    const { fetch, calls } = mockFetch(reportResponse());
    const report = await client(fetch).validateFacturXReport(PDF);
    expect(report.valid).toBeNull();
    expect(fieldNames(calls[0]!)).toEqual(["file"]);
  });

  it("surfaces a malformed file through InvoiceXmlError", async () => {
    const problem = { title: "Invalid file", status: 400, errorCode: 4003, errors: [], warnings: [] };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).validateFacturXReport(XML).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    expect((error as InvoiceXmlError).status).toBe(400);
  });
});

describe("transform", () => {
  it("sends every option and returns the PDF bytes", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const pdf = await client(fetch).transformToFacturX(PDF, {
      language: "auto",
      preserveOriginalPdf: true,
      includeAdvancedProperties: true,
      validationLanguage: "FR",
    });

    expect(Array.from(pdf)).toEqual(Array.from(PDF));
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/transform/to/facturx");
    const body = form(calls[0]!);
    expect((body.get("file") as File).type).toBe("application/pdf");
    expect(body.get("language")).toBe("auto");
    expect(body.get("preserveOriginalPdf")).toBe("true");
    expect(body.get("includeAdvancedProperties")).toBe("true");
    expect(body.get("validationLanguage")).toBe("FR");
  });

  it("omits unset options, so the API defaults apply", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch).transformToFacturX(PDF);
    expect(fieldNames(calls[0]!)).toEqual(["file"]);
  });

  it("really sends includeAdvancedProperties false", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    await client(fetch).transformToFacturX(PDF, { includeAdvancedProperties: false });
    expect(form(calls[0]!).get("includeAdvancedProperties")).toBe("false");
  });

  it("surfaces a refused invoice through InvoiceXmlError", async () => {
    const problem = { title: "Invoice validation failed", status: 400, errorCode: 4001, errors: [{ rule: "BR-16", message: "x" }], warnings: [] };
    const { fetch } = mockFetch(jsonResponse(problem, 400));
    const error = await client(fetch).transformToFacturX(PDF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvoiceXmlError);
    expect((error as InvoiceXmlError).errors[0]!.rule).toBe("BR-16");
  });

  it("makes one request on a 429 and throws TooManyRequestsError", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({ title: "Too Many Requests" }, 429, { "Retry-After": "7" }));
    const error = await client(fetch).transformToFacturX(PDF).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect((error as TooManyRequestsError).status).toBe(429);
    expect((error as TooManyRequestsError).retryAfter).toBe(7);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/transform/to/facturx");
  });
});


describe("email", () => {
  const accepted = { status: "accepted", messageId: "msg-1" };
  const required = { from: "factures@atelier-numerique.example", to: "compta@grand-siecle.example" };
  const full = {
    ...required,
    fromName: "Atelier Numerique",
    cc: ["archives@atelier-numerique.example", "fiscal@atelier-numerique.example"],
    bcc: ["copie@atelier-numerique.example"],
    replyTo: "recouvrement@atelier-numerique.example",
    subject: "Facture FA-2026-0042",
    message: "Bonjour,\n\nVeuillez trouver notre facture ci-jointe.",
  };

  it("posts the invoice envelope plus the email object and returns the message id", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    const result = await client(fetch).emailFacturX(invoice, full, { language: "FR", rules: ["br-fr"] });

    expect(result).toEqual(accepted);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.invoicexml.com/v1/create/facturx/email");
    expect(call.init.method).toBe("POST");
    expect(headers(call).Authorization).toBe("Bearer test-key");
    expect(headers(call)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call.init.body as string)).toEqual({
      invoice,
      options: { language: "FR", rules: ["br-fr"] },
      email: full,
    });
  });

  it("omits options and unset email fields from the JSON body", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailFacturX(invoice, { ...required, subject: undefined, cc: undefined });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ invoice, email: required });
  });

  it("embeds with pdf and xml parts plus email fields, one part per copy address", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    const result = await client(fetch).emailEmbeddedFacturX(PDF, XML, full, { rules: ["br-fr"] });

    expect(result).toEqual(accepted);
    expect(calls[0]!.url).toBe("https://api.invoicexml.com/v1/embed/facturx/email");
    expect(headers(calls[0]!)["Content-Type"]).toBeUndefined();
    const body = form(calls[0]!);
    expect((body.get("pdf") as File).name).toBe("invoice.pdf");
    expect((body.get("xml") as File).type).toBe("application/xml");
    expect(body.get("email.from")).toBe(full.from);
    expect(body.get("email.fromName")).toBe(full.fromName);
    expect(body.get("email.to")).toBe(full.to);
    expect(body.getAll("email.cc")).toEqual(full.cc);
    expect(body.getAll("email.bcc")).toEqual(full.bcc);
    expect(body.get("email.replyTo")).toBe(full.replyTo);
    expect(body.get("email.subject")).toBe(full.subject);
    expect(body.get("email.message")).toBe(full.message);
    expect(body.getAll("rules")).toEqual(["br-fr"]);
  });

  it("omits unset email fields and rules from the form and never sends skipValidation", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailEmbeddedFacturX(PDF, XML, required);
    const names: string[] = [];
    form(calls[0]!).forEach((_, name) => names.push(name));
    expect(names).toEqual(["pdf", "xml", "email.from", "email.to"]);
  });

  it("surfaces an unverified sender domain through InvoiceXmlError", async () => {
    const problem = { title: "Sender domain not verified", status: 400, errorCode: 4022, errors: [], warnings: [] };
    const { fetch, calls } = mockFetch(jsonResponse(problem, 400), jsonResponse(problem, 400));
    const fromJson = await client(fetch).emailFacturX(invoice, required).catch((e: unknown) => e);
    const fromForm = await client(fetch).emailEmbeddedFacturX(PDF, XML, required).catch((e: unknown) => e);

    for (const error of [fromJson, fromForm]) {
      expect(error).toBeInstanceOf(InvoiceXmlError);
      expect((error as InvoiceXmlError).status).toBe(400);
      expect((error as InvoiceXmlError).errorCode).toBe(4022);
    }
    expect(calls).toHaveLength(2);
  });

  it("retries a 429, which sent nothing, with the same form", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({}, 429, { "Retry-After": "0" }), jsonResponse(accepted));
    const result = await client(fetch).emailEmbeddedFacturX(PDF, XML, required);

    expect(result).toEqual(accepted);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.init.body).toBe(calls[0]!.init.body);
  });

  it("does not resend after a 5xx, which could send a second email", async () => {
    const { fetch, calls } = mockFetch(new Response("upstream unavailable", { status: 503 }));
    await expect(client(fetch).emailFacturX(invoice, required)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it("does not resend after a network failure, which could send a second email", async () => {
    const { fetch, calls } = mockFetch();
    await expect(client(fetch).emailEmbeddedFacturX(PDF, XML, required)).rejects.toThrow("Unexpected request");
    expect(calls).toHaveLength(1);
  });

  it("skips null form fields, so subject null is not sent as the text null", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted));
    await client(fetch).emailEmbeddedFacturX(PDF, XML, { ...required, subject: null, cc: null } as unknown as EmailMessage);
    const names: string[] = [];
    form(calls[0]!).forEach((_, name) => names.push(name));
    expect(names).toEqual(["pdf", "xml", "email.from", "email.to"]);
  });

  it.each(["from", "fromName", "to", "replyTo", "subject", "message"])(
    "refuses a list in %s on both route types before sending",
    async (field) => {
      const { fetch, calls } = mockFetch();
      const email = { ...required, [field]: ["one", "two"] } as unknown as EmailMessage;

      await expect(client(fetch).emailFacturX(invoice, email)).rejects.toThrow(TypeError);
      await expect(client(fetch).emailFacturX(invoice, email)).rejects.toThrow(`email.${field}`);
      await expect(client(fetch).emailEmbeddedFacturX(PDF, XML, email)).rejects.toThrow(TypeError);
      expect(calls).toHaveLength(0);
    },
  );

  it("drops blank copy addresses and trims the rest on both route types", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted), jsonResponse(accepted));
    const email = { ...required, cc: [" ", " archives@atelier-numerique.example "], bcc: [""] };

    await client(fetch).emailFacturX(invoice, email);
    await client(fetch).emailEmbeddedFacturX(PDF, XML, email);

    expect(JSON.parse(calls[0]!.init.body as string).email).toEqual({
      ...required,
      cc: ["archives@atelier-numerique.example"],
    });
    expect(form(calls[1]!).getAll("email.cc")).toEqual(["archives@atelier-numerique.example"]);
    expect(form(calls[1]!).has("email.bcc")).toBe(false);
  });

  it("turns a single copy address from a JavaScript caller into a list on both route types", async () => {
    const { fetch, calls } = mockFetch(jsonResponse(accepted), jsonResponse(accepted));
    const email = { ...required, cc: "archives@atelier-numerique.example" } as unknown as EmailMessage;

    await client(fetch).emailFacturX(invoice, email);
    await client(fetch).emailEmbeddedFacturX(PDF, XML, email);

    expect(JSON.parse(calls[0]!.init.body as string).email.cc).toEqual(["archives@atelier-numerique.example"]);
    expect(form(calls[1]!).getAll("email.cc")).toEqual(["archives@atelier-numerique.example"]);
  });
});

describe("form fields", () => {
  it("skips null values and keeps set values on non-email routes", async () => {
    const { fetch, calls } = mockFetch(new Response(PDF));
    const options = { rules: null, skipValidation: true } as unknown as EmbedOptions;
    await client(fetch).embedFacturX(PDF, XML, options);

    const body = form(calls[0]!);
    expect(body.has("rules")).toBe(false);
    expect(body.get("skipValidation")).toBe("true");
  });
});

describe("rate limiting", () => {
  it("waits Retry-After seconds on 429 and retries", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch(jsonResponse({ title: "Too Many Requests" }, 429, { "Retry-After": "5" }), new Response(PDF));
    const pending = client(fetch).createFacturX(invoice);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeInstanceOf(Uint8Array);
    expect(calls).toHaveLength(2);
  });

  it("retries a 429 on render, convert and report calls", async () => {
    const limited = () => jsonResponse({}, 429, { "Retry-After": "0" });
    const { fetch, calls } = mockFetch(limited(), new Response(PDF), limited(), new Response(XML), limited(), new Response(PDF));
    const sdk = client(fetch);

    await sdk.renderCiiToPdf(XML);
    await sdk.convertFacturXToUbl(PDF);
    await sdk.validateFacturXReport(PDF);

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/render/cii/to/pdf",
      "/v1/render/cii/to/pdf",
      "/v1/convert/facturx/to/ubl",
      "/v1/convert/facturx/to/ubl",
      "/v1/validate/facturx/report",
      "/v1/validate/facturx/report",
    ]);
  });

  it("throws TooManyRequestsError once retries are used up", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({}, 429, { "Retry-After": "0" }), jsonResponse({}, 429, { "Retry-After": "0" }));
    const e = await client(fetch, { maxRetries: 1 }).validateFacturX(PDF).catch((x: unknown) => x);

    expect(e).toBeInstanceOf(TooManyRequestsError);
    expect((e as TooManyRequestsError).retryAfter).toBe(0);
    expect(calls).toHaveLength(2);
  });
});
