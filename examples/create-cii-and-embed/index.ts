// Builds a CII XML from your invoice data, then embeds it into a PDF you already have.
// Use this when your own system prints the invoice PDF and you want it to become a
// Factur-X invoice. The CII XML declares the EN 16931 profile, so it embeds as it is.

import { readFile, writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError, type InvoiceDocument } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_PATH = "factures/F-2026-001.pdf"; // the PDF your system printed
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
  // Read the PDF first, so a wrong path stops the example before any API call.
  const pdf = await readFile(PDF_PATH);

  // 1. Build the CII XML from the invoice data. language words the default texts, such as the payment terms.
  const cii = await client.createCii(invoice, {
    language: "FR",
    // rules: ["br-fr"], // optional: also check the French BR-FR rules (they need more data, see the README)
  });

  // 2. Embed the XML into your PDF. The result is a Factur-X PDF/A-3.
  const facturX = await client.embedFacturX(pdf, cii);

  await writeFile(OUTPUT_PATH, facturX);
  console.log(`Saved the Factur-X invoice to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${PDF_PATH}.`);
    console.log("Set PDF_PATH at the top of index.ts to a PDF on your machine.");
  } else if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The invoice data would not produce a compliant invoice. Each finding names the field to fix.
    console.log("The invoice is not compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
