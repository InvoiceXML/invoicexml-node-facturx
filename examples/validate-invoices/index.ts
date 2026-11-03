// Validates an incoming Factur-X invoice against the rules of the profile it declares, and
// optionally the French BR-FR rules. A failed validation is a normal result, not an exception:
// you get the verdict and every finding with the rule, the message and the field it concerns.
// The example also saves the printable validation report PDF, for example to send back to a supplier.

import { readFile, writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError, type RuleSet } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const FACTURX_PDF_PATH = "factures/facture-fournisseur.pdf";
const REPORT_PATH = "facture-fournisseur-rapport.pdf";

// Optional: also check the French BR-FR rules, the set the French platforms apply to domestic invoices.
const RULES: RuleSet[] = []; // for example ["br-fr"]

const client = new FacturXClient({ apiKey: API_KEY });

try {
  const pdf = await readFile(FACTURX_PDF_PATH);

  // 1. The verdict and the findings as data.
  const result = await client.validateFacturX(pdf, { rules: RULES });
  console.log(`${result.valid ? "Valid" : "Not valid"}. ${result.detail}`);

  for (const error of result.errors) console.log(`  error   [${error.rule}] ${error.message} (${error.fields.join(", ")})`);

  // Warnings never make an invoice invalid, but are worth reviewing.
  for (const warning of result.warnings) console.log(`  warning [${warning.rule}] ${warning.message} (${warning.fields.join(", ")})`);

  // 2. The same check as a printable PDF report, worded in French.
  const report = await client.validateFacturXReport(pdf, { rules: RULES, validationLanguage: "FR" });
  await writeFile(REPORT_PATH, report.file);
  console.log(`Saved the validation report to ${REPORT_PATH} (valid: ${report.valid}).`);
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${FACTURX_PDF_PATH}.`);
    console.log("Set FACTURX_PDF_PATH at the top of index.ts to a Factur-X PDF on your machine.");
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a file that is not a PDF.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
