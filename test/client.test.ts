import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FacturXClient,
  FacturXProfiles,
  InvoiceXmlError,
  TooManyRequestsError,
  VERSION,
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

  it("throws TooManyRequestsError once retries are used up", async () => {
    const { fetch, calls } = mockFetch(jsonResponse({}, 429, { "Retry-After": "0" }), jsonResponse({}, 429, { "Retry-After": "0" }));
    const e = await client(fetch, { maxRetries: 1 }).validateFacturX(PDF).catch((x: unknown) => x);

    expect(e).toBeInstanceOf(TooManyRequestsError);
    expect((e as TooManyRequestsError).retryAfter).toBe(0);
    expect(calls).toHaveLength(2);
  });
});
