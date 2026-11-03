// Creates a Factur-X invoice that keeps your own PDF layout.
// The API downloads your PDF from a public URL, embeds the XML it generates from the invoice
// data into it, and returns a Factur-X PDF/A-3. Nothing about your PDF's look changes.

import { writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError, type InvoiceDocument } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_URL = "https://example.com/factures/F-2026-001.pdf"; // public http(s) URL of your PDF
const OUTPUT_PATH = "F-2026-001-facturx.pdf";

const client = new FacturXClient({ apiKey: API_KEY });

const invoice: InvoiceDocument = {
  invoiceNumber: "F-2026-001",
  currency: "EUR",
  seller: {
    name: "Atelier Dupont SARL",
    vatIdentifier: "FR32123456789",
    postalAddress: { city: "Paris", postCode: "75011", country: "FR" },
  },
  buyer: {
    name: "Client Exemple SA",
    postalAddress: { city: "Lyon", postCode: "69002", country: "FR" },
  },
  lines: [
    {
      quantity: 10,
      unitCode: "HUR", // hour
      item: { name: "Prestation de conseil" },
      priceDetails: { netPrice: 120 },
      vatInformation: { categoryCode: "S", rate: 20 },
    },
  ],
};

try {
  // pdfUrl makes your PDF the visual layer. Without it, the API renders its own invoice layout.
  const facturX = await client.createFacturX(invoice, {
    pdfUrl: PDF_URL,
    // rules: ["br-fr"], // optional: also check the French BR-FR rules (they need more data, see the README)
  });

  await writeFile(OUTPUT_PATH, facturX);
  console.log(`Saved the Factur-X invoice to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The invoice data would not produce a compliant Factur-X invoice. Each finding names the field to fix.
    console.log("The invoice is not compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a PDF URL the API could not download.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
