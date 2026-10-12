// Loads the built ESM output and runs one create and one upload against a fake fetch.
// Runs on every supported Node version in CI: node test/smoke.mjs
import assert from "node:assert/strict";
import { FacturXClient, FacturXProfiles, InvoiceXmlError } from "../dist/index.js";

const seen = [];
const fetch = async (url) => {
  seen.push(url);
  if (url.endsWith("/v1/create/facturx")) return new Response(new Uint8Array([37, 80, 68, 70]));
  return new Response(JSON.stringify({ valid: true, errors: [], warnings: [] }));
};

const client = new FacturXClient({ apiKey: "smoke", fetch });
const pdf = await client.createFacturX({ invoiceNumber: "1", currency: "EUR", seller: null, buyer: null, lines: [] });
assert.equal(pdf.byteLength, 4);
assert.equal((await client.validateFacturX(pdf, { rules: ["br-fr"] })).valid, true);
assert.equal(FacturXProfiles.EN16931, "urn:cen.eu:en16931:2017");
assert.equal(typeof InvoiceXmlError, "function");
assert.equal(seen.length, 2);
console.log(`ESM smoke test passed on Node ${process.version}`);
