// Loads the built CommonJS output and runs one create and one upload against a fake fetch.
// Runs on every supported Node version in CI: node test/smoke.cjs
const assert = require("node:assert/strict");
const { FacturXClient, TooManyRequestsError } = require("../dist/index.cjs");

(async () => {
  const fetch = async (url) =>
    url.endsWith("/v1/create/facturx")
      ? new Response(new Uint8Array([37, 80, 68, 70]))
      : new Response(JSON.stringify({ valid: false, errors: [{ rule: "BR-FR-05", message: "x" }], warnings: [] }));

  const client = new FacturXClient({ apiKey: "smoke", fetch });
  const pdf = await client.createFacturX({ invoiceNumber: "1", currency: "EUR", seller: null, buyer: null, lines: [] });
  assert.equal(pdf.byteLength, 4);
  assert.equal((await client.validateFacturX(pdf)).errors[0].rule, "BR-FR-05");
  assert.equal(typeof TooManyRequestsError, "function");
  console.log(`CJS smoke test passed on Node ${process.version}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
