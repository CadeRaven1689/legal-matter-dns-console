import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { DnsClient, InfraiError } from "./dns_client.ts";
import { matterIntakeSchema, planMatterRecords } from "./matter_records.ts";

const domainSchema = z.object({ domain: z.string().min(3) });

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function clientStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

export function createLegalDnsService(client: DnsClient) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/admin/domains") {
        const input = domainSchema.parse(await readJson(request));
        const domain = await client.addDomain(input.domain);
        send(response, 201, { domain: input.domain, zoneId: domain.zone_id });
        return;
      }

      if (request.method === "POST" && request.url === "/admin/matters") {
        const input = matterIntakeSchema.parse(await readJson(request));
        const domain = await client.getDomain(input.domain);
        const plan = planMatterRecords(input);
        for (const record of plan.records) await client.upsertRecord(domain.zone_id, record);
        await client.verifyDomain(input.domain);
        send(response, 201, {
          matterId: input.matterId,
          zoneId: domain.zone_id,
          followUp: plan.followUp,
          recordsWritten: plan.records.length,
          domainReview: "requested"
        });
        return;
      }

      send(response, 404, { error: "Route not found" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        send(response, 400, { error: "Invalid request", issues: error.issues });
        return;
      }
      if (error instanceof InfraiError) {
        send(response, clientStatus(error), { error: error.message, code: error.code });
        return;
      }
      send(response, 500, { error: "Unexpected service error" });
    }
  });
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const port = Number(process.env.PORT ?? "3000");
createLegalDnsService(new DnsClient(apiKey)).listen(port, () => {
  console.log(`Legal DNS admin service listening on http://localhost:${port}`);
});
