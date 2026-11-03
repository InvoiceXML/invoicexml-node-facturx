# Examples

Small scripts, one per common task. Each one is a complete `index.ts` you can read from top to bottom and adapt.

| Example | What it shows |
|---|---|
| [create-facturx-with-own-pdf](create-facturx-with-own-pdf/index.ts) | Create a Factur-X invoice that keeps your own PDF layout, passed as a public URL (`pdfUrl`). |
| [create-cii-and-embed](create-cii-and-embed/index.ts) | Build a CII XML from your invoice data with `createCii`, then embed it into a PDF you already have with `embedFacturX`. |
| [validate-invoices](validate-invoices/index.ts) | Validate a Factur-X PDF, optionally against the French BR-FR rules, print every finding, and save the printable validation report. |
| [render-xml-to-pdf](render-xml-to-pdf/index.ts) | Turn any invoice XML (CII, UBL or XRechnung) into a readable PDF. |
| [convert-ubl-to-facturx](convert-ubl-to-facturx/index.ts) | Convert a UBL invoice XML into a Factur-X invoice. |
| [transform-to-facturx](transform-to-facturx/index.ts) | Turn an ordinary PDF invoice into a Factur-X invoice. AI reads the PDF, so a person checks the result. |
| [parse-pdf-invoice](parse-pdf-invoice/index.ts) | Read an ordinary PDF invoice, typed, scanned or photographed, into the invoice model with AI, and see how sure the read was per area. |
| [extract-json-and-attachments](extract-json-and-attachments/index.ts) | Read a received Factur-X invoice as a typed `InvoiceDocument` and save its embedded attachments as a ZIP. |

## Run an example

1. Open the example's `index.ts` and replace the values at the top: `YOUR_API_KEY` with your API key, and the file paths or URLs with your own. An example whose file is missing tells you which value to change.
2. Build the library once, then run the example from the repository root. Node.js 22.18 or later runs the TypeScript file directly; on older versions use a TypeScript runner such as `npx tsx`.

```bash
npm install
npm run build
node examples/create-cii-and-embed/index.ts
```

The examples use the library source in this repository: inside the repository, `@invoicexml/facturx` resolves to the package itself, built from `src`, and `npm run typecheck` checks the examples against `src`. To use one in your own project, copy its `index.ts` and install the package instead. The import stays the same:

```bash
npm install @invoicexml/facturx
```

Get an API key with the **30-day free trial: 100 credits, no credit card required** at [www.invoicexml.com/account/signup](https://www.invoicexml.com/account/signup). The calls use credits from your account, so run the examples with test data.
