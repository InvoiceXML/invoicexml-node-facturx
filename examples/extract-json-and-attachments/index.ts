// Reads a Factur-X invoice you received: the invoice data as a typed InvoiceDocument, and the
// supporting documents embedded in it (timesheets, delivery notes) as one ZIP archive.

import { readFile, writeFile } from "node:fs/promises";
import { FacturXClient, InvoiceXmlError } from "@invoicexml/facturx";

// Replace these values with your own.
const API_KEY = "YOUR_API_KEY";
const FACTURX_PDF_PATH = "factures/facture-fournisseur.pdf"; // a CII invoice XML works too
const ATTACHMENTS_ZIP_PATH = "facture-fournisseur-pieces-jointes.zip";

const client = new FacturXClient({ apiKey: API_KEY });

try {
  const file = await readFile(FACTURX_PDF_PATH);

  // 1. The invoice data, read from the embedded XML. It can be passed straight back to createFacturX.
  const { invoice } = await client.extractJson(file);

  console.log(`Invoice ${invoice.invoiceNumber} from ${invoice.seller?.name} to ${invoice.buyer?.name}`);
  console.log(
    `Total ${invoice.totals?.grandTotalAmount} ${invoice.currency}, due ${invoice.totals?.duePayableAmount}, ${invoice.lines.length} line(s)`,
  );
  for (const line of invoice.lines) console.log(`  ${line.quantity} x ${line.item?.name} at ${line.priceDetails?.netPrice}`);

  // 2. The embedded supporting documents, as one ZIP archive.
  try {
    const attachments = await client.extractAttachments(file);
    await writeFile(ATTACHMENTS_ZIP_PATH, attachments);
    console.log(`Saved the attachments to ${ATTACHMENTS_ZIP_PATH}.`);
  } catch (error) {
    // 4013: the invoice has no embedded attachments.
    if (!(error instanceof InvoiceXmlError && error.errorCode === 4013)) throw error;
    console.log("The invoice has no embedded attachments.");
  }
} catch (error) {
  process.exitCode = 1;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`Could not find ${FACTURX_PDF_PATH}.`);
    console.log("Set FACTURX_PDF_PATH at the top of index.ts to a Factur-X PDF on your machine.");
  } else if (error instanceof InvoiceXmlError) {
    // For example an invalid API key, or a PDF without an embedded invoice.
    console.log(`The API refused the request: ${error.message}`);
  } else {
    throw error;
  }
}
