import assert from "node:assert/strict";
import test from "node:test";
import { planMatterRecords } from "../src/matter_records.ts";

test("marks a matter due soon and publishes the decision in its deadline record", () => {
  const plan = planMatterRecords({
    matterId: "matter-1042",
    domain: "legal.example.com",
    clientReference: "checkout-dispute-1042",
    signedDocumentHost: "documents.example.com",
    deadline: "2027-02-18T17:00:00.000Z",
    now: "2027-02-13T09:00:00.000Z"
  });

  assert.equal(plan.followUp, "due-soon");
  assert.equal(plan.records.length, 3);
  assert.equal(plan.records[2]?.record_type, "TXT");
  assert.match(plan.records[2]?.content ?? "", /follow_up=due-soon/);
  assert.equal(plan.records[1]?.name, "signed-matter-1042");
});
