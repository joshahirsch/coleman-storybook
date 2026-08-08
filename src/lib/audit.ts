import { db } from "@/db/client";
import { auditEvents, analyticsEvents } from "@/db/schema";

interface AuditEventInput {
  organizationId: string | null;
  actorType: "contributor" | "admin" | "system";
  actorId?: string | null;
  eventType: string;
  subjectType: string;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Structured audit log. Never pass transcript/media content in metadata — see docs/security.md. */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    metadata: input.metadata ?? null,
  });
}

interface AnalyticsEventInput {
  organizationId?: string | null;
  eventType: string;
  campaignId?: string | null;
  submissionId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Privacy-conscious product analytics — see docs/architecture.md Section 10. No testimonial content. */
export async function trackAnalyticsEvent(input: AnalyticsEventInput): Promise<void> {
  await db.insert(analyticsEvents).values({
    organizationId: input.organizationId ?? null,
    eventType: input.eventType,
    campaignId: input.campaignId ?? null,
    submissionId: input.submissionId ?? null,
    metadata: input.metadata ?? null,
  });
}
