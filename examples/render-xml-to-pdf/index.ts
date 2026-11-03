// Turns any invoice XML into a readable PDF, for approval workflows and archives.
// CII (such as the XML inside a Factur-X invoice), UBL and XRechnung are all accepted;
// the format is detected from the XML.

import { readFile, writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const XML_PATH = "factures/F-2026-001.xml";
const OUTPUT_PATH = "F-2026-001-apercu.pdf";

const client = new FacturXClient({ apiKey: API_KEY });

try {
  const xml = await readFile(XML_PATH);

  const pdf = await client.renderXmlToPdf(xml, {
    language: "FR",                                 // labels and date formats of the PDF
    includeQrCode: true,                            // optional: a payment QR code for banking apps
    // logoUrl: "https://example.com/logo.png",     // optional: public URL of your logo, printed top left
  });

  await writeFile(OUTPUT_PATH, pdf);
  console.log(`Saved the PDF to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${XML_PATH}.`);
    console.log("Set XML_PATH at the top of index.ts to an invoice XML on your machine.");
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a file that is not an invoice XML.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
