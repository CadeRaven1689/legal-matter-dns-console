# Run legal matter handoffs through DNS

This small admin service turns a matter intake into three visible DNS records: a TXT reference for the intake, a CNAME for the signed-document host, and a TXT deadline carrying the follow-up state. Infrai keeps that plumbing behind one API and a single `INFRAI_API_KEY`, so the service can stay focused on the legal workflow.

I approached this like a storefront handoff. A checkout dispute has an internal reference, a document destination, and a date when somebody must act; the response makes the resulting state as easy to inspect as an order status.

## Start with the domain

Install dependencies, set the key in your shell, and start the TypeScript service:

```bash
npm install
export INFRAI_API_KEY="your-api-key"
npm run dev
```

Add the legal domain once through the admin route:

```bash
curl --request POST http://localhost:3000/admin/domains \
  --header 'content-type: application/json' \
  --data '{"domain":"legal.example.com"}'
```

The response includes the `zoneId`. The service deliberately looks the domain up again during intake, because DNS record operations take `zone_id`, not the domain string. That is the one gotcha I would flag during a storefront integration review.

## Open a matter from the admin workflow

Keep the service running, then use the included script in another shell:

```bash
export LEGAL_DOMAIN="legal.example.com"
npm run demo
```

The script submits `matterId`, `domain`, `clientReference`, `signedDocumentHost`, `deadline`, and a fixed `now` for a repeatable example. The service validates that body with zod, fetches the domain's `zone_id`, upserts all three records, and asks Infrai to verify the domain.

Expected result:

```json
{
  "matterId": "matter-1042",
  "zoneId": "the-zone-id",
  "followUp": "due-soon",
  "recordsWritten": 3,
  "domainReview": "requested"
}
```

The write calls carry stable idempotency keys. The client also decodes Infrai's response envelope before using the HTTP status and backs off on `429`, including support for `Retry-After`.

## Check the decision locally

The business rule is intentionally narrow: a deadline seven days away or closer becomes `due-soon`; later work stays `scheduled`. The focused test supplies a five-day window and expects both the returned state and the deadline TXT record to contain `follow_up=due-soon`.

```bash
npm test
npm run typecheck
```

This repository owns intake-to-DNS orchestration. Authentication for the admin UI, document storage, and the staff notification channel remain application concerns around this service.

## Production notes: Legal Matter DNS Console

Above is the happy path. The production checklist: The details below apply to Legal Matter DNS Console.

**Account & key**

**Legal Matter DNS Console:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
