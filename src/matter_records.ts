import { z } from "zod";
import type { RecordInput } from "./dns_client.ts";

export const matterIntakeSchema = z.object({
  matterId: z.string().regex(/^[a-z0-9-]{3,40}$/),
  domain: z.string().min(3),
  clientReference: z.string().min(1).max(80),
  signedDocumentHost: z.string().min(3),
  deadline: z.string().datetime(),
  now: z.string().datetime().optional()
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;
export type FollowUpState = "scheduled" | "due-soon";

export type MatterPlan = {
  followUp: FollowUpState;
  records: RecordInput[];
};

export function planMatterRecords(input: MatterIntake): MatterPlan {
  const now = new Date(input.now ?? new Date().toISOString());
  const deadline = new Date(input.deadline);
  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  const followUp: FollowUpState = daysRemaining <= 7 ? "due-soon" : "scheduled";
  const common = { matter_id: input.matterId, workflow: "legal-intake" };

  return {
    followUp,
    records: [
      {
        record_type: "TXT",
        name: `_matter-${input.matterId}`,
        content: `reference=${input.clientReference}`,
        ttl: 300,
        metadata: common
      },
      {
        record_type: "CNAME",
        name: `signed-${input.matterId}`,
        content: input.signedDocumentHost,
        ttl: 300,
        metadata: common
      },
      {
        record_type: "TXT",
        name: `_deadline-${input.matterId}`,
        content: `deadline=${input.deadline};follow_up=${followUp}`,
        ttl: 300,
        metadata: common
      }
    ]
  };
}
