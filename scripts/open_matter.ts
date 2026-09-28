const serviceOrigin = process.env.SERVICE_ORIGIN ?? "http://localhost:3000";
const domain = process.env.LEGAL_DOMAIN;
if (!domain) throw new Error("Set LEGAL_DOMAIN before running the demo");

const intake = {
  matterId: "matter-1042",
  domain,
  clientReference: "checkout-dispute-1042",
  signedDocumentHost: `documents.${domain}`,
  deadline: "2027-02-18T17:00:00.000Z",
  now: "2027-02-13T09:00:00.000Z"
};

const response = await fetch(`${serviceOrigin}/admin/matters`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(intake)
});
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
