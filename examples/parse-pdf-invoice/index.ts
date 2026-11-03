// Reads an ordinary PDF invoice, typed, scanned or photographed, into the InvoiceDocument model.
// AI reads the PDF, so a person must check the data before it is used. The result says how sure
// the read was per area, which tells the person where to look first.
// To read a Factur-X PDF or a CII XML, use the extract-json-and-attachments example instead:
// it reads the embedded XML exactly, without AI.

import { readFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError, TooManyRequestsError } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const PDF_PATH = "factures/facture-fournisseur.pdf"; // an ordinary PDF invoice
const CHECK_BELOW = 0.8; // areas scored below this are flagged for a closer check

const client = new FacturXClient({ apiKey: API_KEY });

function flag(area: string, score: number | null): void {
  const note = score === null ? "no score" : score < CHECK_BELOW ? "check this closely" : "ok";
  console.log(`  ${area}: ${score ?? "-"} (${note})`);
}

try {
  // Read the PDF first, so a wrong path stops the example before any API call.
  const pdf = await readFile(PDF_PATH);

  const { invoice, confidence, language } = await client.parseJson(pdf);

  console.log(`Invoice ${invoice.invoiceNumber} from ${invoice.seller?.name} to ${invoice.buyer?.name}`);
  console.log(`Total ${invoice.totals?.grandTotalAmount} ${invoice.currency}, due ${invoice.totals?.duePayableAmount}`);
  for (const line of invoice.lines) console.log(`  ${line.quantity} x ${line.item?.name} at ${line.priceDetails?.netPrice}`);

  // The language the invoice is written in, as an ISO 639-1 code such as "fr". Missing when unknown.
  console.log(`Language: ${language ?? "unknown"}`);

  // Scores run from 0.0 (had to guess) to 1.0 (unambiguous). They can be missing.
  if (confidence) {
    console.log(`Confidence overall: ${confidence.overall ?? "-"}`);
    flag("seller", confidence.areas.sellerIdentification);
    flag("buyer", confidence.areas.buyerIdentification);
    flag("VAT", confidence.areas.taxCalculation);
    flag("lines", confidence.areas.lineItems);
  }

  // The checked invoice can be passed straight to a create method, for example
  // client.createFacturX(invoice) to turn it into a Factur-X invoice.
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${PDF_PATH}.`);
    console.log("Set PDF_PATH at the top of index.ts to a PDF invoice on your machine.");
  } else if (error instanceof TooManyRequestsError) {
    // Parse calls are not retried automatically, because a retry repeats the AI read.
    console.log(`Too many requests. Wait ${error.retryAfter} seconds before trying again.`);
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a file that is not a PDF invoice.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
