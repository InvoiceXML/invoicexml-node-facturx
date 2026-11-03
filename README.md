# Factur-X for Node.js

[![npm](https://img.shields.io/npm/v/@invoicexml/facturx)](https://www.npmjs.com/package/@invoicexml/facturx)
[![tests](https://github.com/InvoiceXML/invoicexml-node-facturx/actions/workflows/tests.yml/badge.svg)](https://github.com/InvoiceXML/invoicexml-node-facturx/actions/workflows/tests.yml)
[![license](https://img.shields.io/npm/l/@invoicexml/facturx)](LICENSE)

Create, validate, embed, render and extract **Factur-X** e-invoices from Node.js and TypeScript: hybrid PDF/A-3 invoices with the CII XML embedded, EN 16931 compliant and, on request, checked against the French mandate's BR-FR rules. It also reads PDF invoices, typed or scanned, into invoice data. A thin, typed client for the [InvoiceXML API](https://www.invoicexml.com) with zero runtime dependencies.

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
- **Zero data retention.** Invoices are processed in memory and returned in the same response. Nothing is stored and nothing is used for AI training. When you email an invoice, it goes to our email service for delivery, and we keep no copy.
- **Processing in Frankfurt.** EU-only processing in Frankfurt, Germany, GDPR compliant by design.
- **Integration assistance.** If a rule finding needs a human explanation, write to [support@invoicexml.com](mailto:support@invoicexml.com) and a person who knows the rule sets answers.

## API

| Method | Endpoint | Returns |
| --- | --- | --- |
| `createFacturX(invoice, options?)` | `POST /v1/create/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `createCii(invoice, { language?, rules? })` | `POST /v1/create/cii` | CII XML as `string`, ready for `embedFacturX` |
| `createUbl(invoice, { profile?, language?, rules? })` | `POST /v1/create/ubl` | UBL XML as `string` |
| `validateFacturX(pdf, { rules? })` | `POST /v1/validate/facturx` | `ValidationResult` |
| `validateFacturXReport(pdf, { rules?, validationLanguage? })` | `POST /v1/validate/facturx/report` | `ValidationReport`: the PDF report in `file`, the verdict in `valid` |
| `embedFacturX(pdf, xml, { skipValidation?, rules? })` | `POST /v1/embed/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `emailFacturX(invoice, email, options?)` | `POST /v1/create/facturx/email` | `EmailSendResult` |
| `emailEmbeddedFacturX(pdf, xml, email, { rules? })` | `POST /v1/embed/facturx/email` | `EmailSendResult` |
| `renderXmlToPdf(xml, { language?, logoUrl?, includeQrCode? })` | `POST /v1/render/xml/to/pdf` | Readable PDF as `Uint8Array` |
| `convertFacturXToUbl(pdf, { validationLanguage? })` | `POST /v1/convert/facturx/to/ubl` | UBL XML as `string` |
| `convertFacturXToCii(pdf, { validationLanguage? })` | `POST /v1/convert/facturx/to/cii` | CII XML as `string` |
| `convertCiiToFacturX(xml, { language?, validationLanguage? })` | `POST /v1/convert/cii/to/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `convertUblToFacturX(xml, { language?, validationLanguage? })` | `POST /v1/convert/ubl/to/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `convertXRechnungToFacturX(xml, { language?, validationLanguage? })` | `POST /v1/convert/xrechnung/to/facturx` | Factur-X PDF/A-3 as `Uint8Array` |
| `transformToFacturX(pdf, options?)` | `POST /v1/transform/to/facturx` | Factur-X PDF/A-3 as `Uint8Array`, to be checked by a person |
| `extractJson(file)` | `POST /v1/extract/json` | `{ invoice }`, ready to pass back to `createFacturX` |
| `extractAttachments(file)` | `POST /v1/extract/attachments` | Supporting documents as a ZIP `Uint8Array` |
| `parseJson(pdf)` | `POST /v1/parse/json` | `ParsedInvoice`: `{ invoice, confidence?, language? }`, to be checked by a person |

Files can be a `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob` or `File`, or the XML as a string. PDF and XML are detected from the content.

The `InvoiceDocument` type is generated from the [OpenAPI schema](https://api.invoicexml.com/v1/openapi), so your editor completes every EN 16931 field. Browse the schema in the [API explorer](https://api.invoicexml.com/v1/scalar/).

### Create options

`createFacturX` accepts `language` (`"EN"`, `"DE"` or `"FR"`), `brandColor` (`"#RRGGBB"`), `logoUrl`, `pdfUrl` (your own PDF as the visual layer), `includeAdvancedProperties` and `rules`.

### Your own PDF layout

To keep the PDF your own system already produces, create the CII XML from the invoice and embed it into that PDF. `createCii` accepts `language` and `rules`, and its XML goes straight into `embedFacturX`. See the [reference](https://www.invoicexml.com/docs/api/create/cii).

```ts
const xml = await client.createCii(invoice, { language: "FR" });
await writeFile("facture.pdf", await client.embedFacturX(await readFile("ma-facture.pdf"), xml));
```

### Create a UBL invoice

`createUbl` builds a UBL XML from the same invoice object, with `profile` choosing the rule set (`"peppol-bis-3"` by default, also `"en16931"`, `"nlcius"`, `"ehf"`, `"xrechnung"` and `"pint"`). See the [reference](https://www.invoicexml.com/docs/api/create/ubl).

```ts
const ubl = await client.createUbl(invoice, { profile: "peppol-bis-3" });
```

### The French e-invoicing mandate

Add the `br-fr` rule set to check an invoice against the mandate's BR-FR rules on top of its profile. It works on create, validate, the validation report and embed, and needs at least the BASIC profile. The BR-FR rules ask for the billing mode in `businessProcessType` (`B1` for goods, `S1` for services, `M1` for mixed), the SIREN of both parties, and the legal mentions as notes with the subject codes `PMT`, `PMD` and `AAB`:

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

### Send an invoice by email

Create or embed an invoice and email it to your customer in one call. It is built and validated exactly as on the plain method, and only an invoice that passes is sent, as a real email from your own address. The sender must be on a domain added and verified on the Verified email domains page of your dashboard. See the [email guide](https://www.invoicexml.com/docs/api/create/facturx/email).

```ts
const { messageId } = await client.emailFacturX(invoice, {
  from: "factures@atelier-numerique.fr",
  fromName: "Atelier Numerique",
  to: "compta@grand-siecle.fr",
  cc: ["archives@atelier-numerique.fr"],
  subject: "Facture FA-2026-0042",
  message: "Bonjour,\n\nVeuillez trouver notre facture ci-jointe.",
}, { language: "FR" });
```

`emailEmbeddedFacturX(pdf, xml, email, { rules? })` packages your own PDF and CII XML first; it always validates, so it has no `skipValidation`.

Only `from` and `to` are required. Left out, the subject is the document type and its number, and the message is a short English text. `cc` and `bcc` hold at most 2 addresses together.

No file comes back: you get `{ status: "accepted", messageId }`. `accepted` means the email was handed over for delivery, not that the recipient's server has received it yet. Keep the `messageId` to ask about a delivery later. No copy of the invoice or of your subject and message is kept.

Refused requests throw an `InvoiceXmlError` and send nothing. `errorCode` 4020 means your plan does not include email delivery ([pricing](https://www.invoicexml.com/pricing)), 4021 that email sending is disabled or paused for your account, and 4022 that the sender's domain is not verified yet. These three are not billed. Error 4002 lists a bad address, a sender domain that is not on your account or too many copies in `errors`.

The client retries a 429 only, which sent nothing. A timeout or a network failure is never retried, because the email may already be on its way, so check before you send it again.

### Validation

Valid and invalid documents both resolve normally, so check `valid`. Each finding carries the rule, its layer (`xsd`, `en16931` or `cius` for national rules such as BR-FR), a plain-language message and the affected fields. `report` lists every invoice field with its value and its findings.

```ts
const result = await client.validateFacturX(await readFile("facture-fournisseur.pdf"));
if (!result.valid) {
  for (const f of result.errors) console.log(`[${f.rule}] (${f.layer}) ${f.message}`);
}
```

### Validation report

`validateFacturXReport` runs the same validation, plus any extra `rules`, and returns a printable PDF report. The verdict is in `valid`, which is `null` if the response carries none. An invalid invoice resolves normally, while a missing or malformed file throws an `InvoiceXmlError`. `validationLanguage` (`"EN"`, `"DE"` or `"FR"`) sets the language of the whole report. See the [reference](https://www.invoicexml.com/docs/api/validate/facturx/report).

```ts
const { file, valid } = await client.validateFacturXReport(await readFile("facture-fournisseur.pdf"), {
  rules: ["br-fr"],
  validationLanguage: "FR",
});
await writeFile("rapport.pdf", file);
if (valid === false) console.log("The invoice is not compliant, see the report.");
```

### Render

`renderXmlToPdf` turns any invoice XML, CII (such as the XML of a Factur-X invoice), UBL or XRechnung, into a readable PDF; the format is detected from the XML. It accepts `language` (`"EN"`, `"DE"` or `"FR"`), `logoUrl` and `includeQrCode`, which prints the payment QR code. See the [reference](https://www.invoicexml.com/docs/api/render/xml/to/pdf).

```ts
const pdf = await client.renderXmlToPdf(await readFile("facture.xml"), { language: "FR" });
```

### Convert

Each convert method covers one route between two formats. No AI is involved, and the result is validated before it is returned: a failed conversion throws an `InvoiceXmlError` with the violated rules in `errors`, worded in `validationLanguage` (`"EN"`, `"DE"` or `"FR"`), which every convert method accepts.

- From Factur-X: `convertFacturXToUbl` and `convertFacturXToCii` read the XML embedded in the PDF.
- To Factur-X: `convertCiiToFacturX`, `convertUblToFacturX` and `convertXRechnungToFacturX` return a PDF/A-3 with a PDF rendered from the invoice. They also accept `language` for that PDF.

```ts
const pdf = await client.convertUblToFacturX(await readFile("facture.xml"), { language: "FR" });
```

Every route has a reference page, for example [Factur-X to UBL](https://www.invoicexml.com/docs/api/convert/facturx/to/ubl) and [UBL to Factur-X](https://www.invoicexml.com/docs/api/convert/ubl/to/facturx).

### Transform

`transformToFacturX(pdf, options?)` builds a Factur-X invoice from a plain PDF. AI reads the PDF, so a person must check the result before it is used.

It accepts `language` (`"EN"`, `"DE"`, `"FR"` or `"auto"`, the default), `preserveOriginalPdf`, `includeAdvancedProperties` (on by default, so the data read can be checked on the pages) and `validationLanguage`. A 429 on this method is not retried automatically, so wait for `Retry-After` before calling again if you want to retry. See the [reference](https://www.invoicexml.com/docs/api/transform/to/facturx).

### Read a PDF invoice with AI

`parseJson(pdf)` reads any PDF invoice, typed, scanned or photographed, into the invoice object, with a `confidence` score from 0 to 1 and the invoice's `language` (any language, so not always a valid `language` option of the other methods). AI reads the PDF, so a person must check the data before it is used; XML embedded in the PDF is ignored, use `extractJson` for that. A 429 on this method is not retried automatically. See the [reference](https://www.invoicexml.com/docs/api/parse/json).

```ts
const { invoice, confidence } = await client.parseJson(await readFile("facture-scannee.pdf"));
console.log(invoice.invoiceNumber, confidence?.overall);
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

On HTTP 429 every call except transform and parse waits for the `Retry-After` delay and retries, up to `maxRetries` times (default 3). After that it throws a `TooManyRequestsError` with `retryAfter` in seconds. A 429 is not billed.

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

## Examples

The [examples](examples) folder holds small scripts that each show one common task from start to finish: creating a Factur-X invoice with your own PDF, creating a CII XML and embedding it, validating, rendering, converting, transforming a PDF invoice, reading a PDF invoice with AI and reading e-invoices. See the [examples overview](examples/README.md) for the list and how to run them.

## Links

- [Documentation](https://www.invoicexml.com/docs)
- [API explorer](https://api.invoicexml.com/v1/scalar/)
- [Factur-X in Node.js, full guide](https://www.invoicexml.com/blog/factur-x-nodejs)
- [Pricing](https://www.invoicexml.com/pricing)

## License

[MIT](LICENSE)
