// Turns an ordinary PDF invoice, for example one from an older billing system or a supplier,
// into a Factur-X invoice. AI reads the PDF, so a person must check the result before it is used.
// The rendered PDF ends with a section of technical properties to make that check easy.

import { readFile, writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError, TooManyRequestsError } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_PATH = "factures/F-2026-001.pdf"; // an ordinary PDF invoice
const OUTPUT_PATH = "F-2026-001-facturx.pdf";

const client = new FacturXClient({ apiKey: API_KEY });

try {
  // Read the PDF first, so a wrong path stops the example before any API call.
  const pdf = await readFile(PDF_PATH);

  const facturX = await client.transformToFacturX(pdf, {
    // language: "FR",                    // optional: left empty, the language the invoice is written in is used
    // preserveOriginalPdf: true,         // optional: keep your PDF as the visual layer instead of a fresh layout
    // includeAdvancedProperties: false,  // optional: leave out the technical properties section
  });

  await writeFile(OUTPUT_PATH, facturX);
  console.log(`Saved the Factur-X invoice to ${OUTPUT_PATH}. Check it before you send or book it.`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${PDF_PATH}.`);
    console.log("Set PDF_PATH at the top of index.ts to a PDF invoice on your machine.");
  } else if (error instanceof InvoiceXmlError && error.errorCode === 4024) {
    // 4024: the amounts read from the PDF do not add up to its printed total, so no invoice was created.
    console.log("The lines, allowances, charges and VAT read from the PDF do not add up to its printed total.");
    console.log("Check the PDF, or create the invoice from your own data with createFacturX instead.");
  } else if (error instanceof TooManyRequestsError) {
    // Transform calls are not retried automatically, because a retry repeats the AI read.
    console.log(`Too many requests. Wait ${error.retryAfter} seconds before trying again.`);
  } else if (error instanceof InvoiceXmlError && error.errors.length > 0) {
    // The data read from the PDF would not make a compliant Factur-X invoice.
    console.log("The invoice read from the PDF is not compliant:");
    for (const finding of error.errors) console.log(`  [${finding.rule}] ${finding.message} (${finding.fields.join(", ")})`);
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a file that is not a PDF invoice.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
