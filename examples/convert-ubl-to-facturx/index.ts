// Converts a UBL invoice XML, for example one received over Peppol, into a Factur-X invoice:
// a readable PDF with the invoice data embedded as CII XML.

import { readFile, writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const UBL_XML_PATH = "factures/F-2026-001-ubl.xml";
const OUTPUT_PATH = "F-2026-001-facturx.pdf";

const client = new FacturXClient({ apiKey: API_KEY });

try {
  const ubl = await readFile(UBL_XML_PATH);

  // language sets the PDF layout and the default texts added when the UBL has none.
  const facturX = await client.convertUblToFacturX(ubl, { language: "FR" });

  await writeFile(OUTPUT_PATH, facturX);
  console.log(`Saved the Factur-X invoice to ${OUTPUT_PATH}.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${UBL_XML_PATH}.`);
    console.log("Set UBL_XML_PATH at the top of index.ts to a UBL invoice XML on your machine.");
  } else if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The result would not be a compliant Factur-X invoice. Each finding names the field to fix.
    console.log("The converted invoice would not be compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
