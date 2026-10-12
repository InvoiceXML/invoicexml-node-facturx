# Factur-X for Node.js

[![npm](https://img.shields.io/npm/v/@invoicexml/facturx)](https://www.npmjs.com/package/@invoicexml/facturx)
[![tests](https://github.com/InvoiceXML/invoicexml-node-facturx/actions/workflows/tests.yml/badge.svg)](https://github.com/InvoiceXML/invoicexml-node-facturx/actions/workflows/tests.yml)
[![license](https://img.shields.io/npm/l/@invoicexml/facturx)](LICENSE)

Create, validate, embed and extract **Factur-X** e-invoices from Node.js and TypeScript: hybrid PDF/A-3 invoices with the CII XML embedded, EN 16931 compliant and, on request, checked against the French mandate's BR-FR rules. A thin, typed client for the [InvoiceXML API](https://www.invoicexml.com) with zero runtime dependencies.

```bash
npm install @invoicexml/facturx
```

Requires Node.js 18 or later. Works with ESM and CommonJS, and in any runtime with `fetch` and `FormData` (Vercel, Netlify, Cloudflare Workers, Deno, Bun).

## Quick start

```ts
import { writeFile } from "node:fs/promises";
import { FacturXClient, type InvoiceDocument } from "@invoicexml/facturx";

const client = new FacturXClient({ apiKey: process.env.INVOICEXML_API_KEY! });

const invoice: InvoiceDocument = {
  invoiceNumber: "FA-2026-0042", issueDate: "2026-09-01", currency: "EUR",
  seller: { name: "Atelier Numerique SARL", vatIdentifier: "FR32123456789", legalRegistration: { identifier: "123456789", schemeId: "0002" }, postalAddress: { line1: "18 Rue de la Republique", city: "Lyon", postCode: "69002", country: "FR" } },
  buyer: { name: "Librairie Grand Siecle SAS", postalAddress: { line1: "5 Boulevard Saint-Germain", city: "Paris", postCode: "75005", country: "FR" } },
  paymentDetails: { paymentAccountIdentifier: "FR7630006000011234567890189" },
  lines: [{ quantity: 12, item: { name: "Maintenance applicative" }, priceDetails: { netPrice: 180 }, vatInformation: { rate: 20 } }],
};
await writeFile("facture.pdf", await client.createFacturX(invoice, { language: "FR" }));
```

You send net prices, quantities and VAT rates. The API computes the totals and the VAT breakdown, builds the CII XML, embeds it as `factur-x.xml` in a PDF/A-3 and validates the result against the official rules before returning it. Get an API key with the [30-day free trial](https://www.invoicexml.com/account/signup): 100 credits, no credit card.

## Why InvoiceXML

- **Rule sets updated on their legal effective dates.** New EN 16931, Factur-X and BR-FR releases go live server-side on the day they take effect. No package update, no redeploy.
- **Validated before delivery.** Every document you create passes the XSD and Schematron rules before it leaves the API. A non-compliant invoice is refused with the violated rules, so it never reaches your customer.
- **Zero data retention.** Invoices are processed in memory and returned in the same response. Nothing is stored and nothing is used for AI training.
- **Processing in Frankfurt.** EU-only processing in Frankfurt, Germany, GDPR compliant by design.
- **Integration assistance.** If a rule finding needs a human explanation, write to [support@invoicexml.com](mailto:support@invoicexml.com) and a person who knows the rule sets answers.

## API

| Method | Endpoint | Returns |
| --- | --- | --- |
| `createFacturX(invoice, options?)` | `POST /v1/create/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `validateFacturX(pdf, { rules? })` | `POST /v1/validate/facturx` | `ValidationResult` |
| `embedFacturX(pdf, xml, { skipValidation?, rules? })` | `POST /v1/embed/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `extractJson(file)` | `POST /v1/extract/json` | `{ invoice }`, ready to pass back to `createFacturX` |
| `extractAttachments(file)` | `POST /v1/extract/attachments` | Supporting documents as a ZIP `Uint8Array` |

Files can be a `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob` or `File`, or the XML as a string. PDF and XML are detected from the content.

The `InvoiceDocument` type is generated from the [OpenAPI schema](https://api.invoicexml.com/v1/openapi), so your editor completes every EN 16931 field. Browse the schema in the [API explorer](https://api.invoicexml.com/v1/scalar/).

### Create options

`createFacturX` accepts `language` (`"EN"`, `"DE"` or `"FR"`), `brandColor` (`"#RRGGBB"`), `logoUrl`, `pdfUrl` (your own PDF as the visual layer), `includeAdvancedProperties` and `rules`.

### The French e-invoicing mandate

Add the `br-fr` rule set to check an invoice against the mandate's BR-FR rules on top of its profile. It works on create, validate and embed, and needs at least the BASIC profile. The BR-FR rules ask for the billing mode in `businessProcessType` (`B1` for goods, `S1` for services, `M1` for mixed), the SIREN of both parties, and the legal mentions as notes with the subject codes `PMT`, `PMD` and `AAB`:

```ts
const pdf = await client.createFacturX({
  ...invoice,
  businessProcessType: "S1",
  notes: [
    { note: "Indemnite forfaitaire pour frais de recouvrement : 40 EUR", subjectCode: "PMT" },
    { note: "Penalites de retard : trois fois le taux d'interet legal", subjectCode: "PMD" },
    { note: "Pas d'escompte pour paiement anticipe", subjectCode: "AAB" },
  ],
  seller: { ...invoice.seller!, electronicAddress: { identifier: "123456789", schemeId: "0225" } },
  buyer: { ...invoice.buyer!, legalRegistration: { identifier: "987654321", schemeId: "0002" }, electronicAddress: { identifier: "987654321", schemeId: "0225" } },
}, { rules: ["br-fr"] });

const mandate = await client.validateFacturX(pdf, { rules: ["br-fr"] });
```

Violations come back with the official rule identifiers and French messages.

### Profiles

EN 16931 is the default. To create another profile, set its identifier from `FacturXProfiles` as the invoice's `specificationId`:

```ts
import { FacturXProfiles } from "@invoicexml/facturx";

const basic = await client.createFacturX({ ...invoice, specificationId: FacturXProfiles.BASIC });
```

`MINIMUM` and `BASIC_WL` carry header data only and serve as booking aids. `BASIC` is the lowest profile the French mandate accepts, and `EXTENDED` adds data for complex invoicing.

### Validation

Valid and invalid documents both resolve normally, so check `valid`. Each finding carries the rule, its layer (`xsd`, `en16931` or `cius` for national rules such as BR-FR), a plain-language message and the affected fields. `report` lists every invoice field with its value and its findings.

```ts
const result = await client.validateFacturX(await readFile("facture-fournisseur.pdf"));
if (!result.valid) {
  for (const f of result.errors) console.log(`[${f.rule}] (${f.layer}) ${f.message}`);
}
```

### Errors and rate limits

Failed requests throw an `InvoiceXmlError` with `status`, `title`, `detail`, a numeric `errorCode` ([error codes](https://www.invoicexml.com/docs/error-handling)) and a `traceId` to quote when contacting support. When a create or embed request is refused because the invoice would not be compliant, `errors` lists the violated rules:

```ts
import { InvoiceXmlError } from "@invoicexml/facturx";

try {
  await client.createFacturX(invoice, { rules: ["br-fr"] });
} catch (e) {
  if (e instanceof InvoiceXmlError && e.status === 400) {
    for (const f of e.errors) console.log(`[${f.rule}] ${f.message}`);
  } else throw e;
}
```

On HTTP 429 the client waits for the `Retry-After` delay and retries, up to `maxRetries` times (default 3). After that it throws a `TooManyRequestsError` with `retryAfter` in seconds. A request answered with 429 was not processed and not billed.

### Client options

```ts
new FacturXClient({
  apiKey: process.env.INVOICEXML_API_KEY!, // required
  maxRetries: 3,                          // 429 retries, 0 disables
  timeoutMs: 120_000,                     // per request
  fetch: customFetch,                     // optional fetch implementation
});
```

Keep the API key on the server. Never call the API from browser code, where the key would be visible to anyone.

## Links

- [Documentation](https://www.invoicexml.com/docs)
- [API explorer](https://api.invoicexml.com/v1/scalar/)
- [Factur-X in Node.js, full guide](https://www.invoicexml.com/blog/factur-x-nodejs)
- [Pricing](https://www.invoicexml.com/pricing)

## License

[MIT](LICENSE)
