/**
 * Coleman Storybook — database schema (Drizzle ORM, PostgreSQL).
 *
 * See docs/data-model.md for the narrative description of each entity and
 * docs/architecture.md Section 5 for the summary this file implements.
 *
 * NOTE on ORM choice: the spec's preferred stack listed Supabase/Postgres
 * without mandating a specific ORM. Prisma was attempted first but its CLI
 * requires downloading a native "schema-engine" binary from
 * binaries.prisma.sh, which this sandbox's network allowlist blocks
 * (403 Forbidden). Drizzle ORM is pure TypeScript/JS with no native binary
 * dependency, works directly over a standard `postgres` driver connection,
 * and is otherwise an equally "simple, proven" choice for a Postgres-backed
 * Next.js app — so it was substituted. See docs/decision-log.md DL-006.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const relationshipEnum = pgEnum("relationship", [
  "camper",
  "staff",
  "camper_staff",
  "parent",
  "alumni_parent",
  "volunteer",
  "other",
]);

export const recordingModeEnum = pgEnum("recording_mode", [
  "quick_answers",
  "guided_story",
]);

export const submissionStateEnum = pgEnum("submission_state", [
  "STARTED",
  "RECORDING",
  "UPLOADING",
  "SUBMITTED",
  "PROCESSING",
  "READY_FOR_REVIEW",
  "PROCESSING_FAILED",
  "WITHDRAWN",
]);

export const editorialStateEnum = pgEnum("editorial_state", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const jobTypeEnum = pgEnum("job_type", ["transcription", "analysis"]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const tagKindEnum = pgEnum("tag_kind", ["ai_theme", "manual"]);

export const actorTypeEnum = pgEnum("actor_type", [
  "contributor",
  "admin",
  "system",
]);

export const mediaAssetStatusEnum = pgEnum("media_asset_status", [
  "pending",
  "confirmed",
  "failed",
]);

// ---------------------------------------------------------------------------
// Organization / Brand / Admin
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationBrands = pgTable("organization_brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  productName: text("product_name").notNull().default("Coleman Storybook"),
  // All visual tokens are nullable/placeholder-safe. See docs/brand-audit.md —
  // nothing here is asserted to be Camp Coleman's official brand until a
  // human confirms it.
  primaryColor: varchar("primary_color", { length: 20 }),
  secondaryColor: varchar("secondary_color", { length: 20 }),
  accentColor: varchar("accent_color", { length: 20 }),
  logoUrl: text("logo_url"),
  fontHeading: text("font_heading"),
  fontBody: text("font_body"),
  isPlaceholder: boolean("is_placeholder").notNull().default(true),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Campaigns / Questions
// ---------------------------------------------------------------------------

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    heroHeadline: text("hero_headline"),
    heroSubhead: text("hero_subhead"),
    introCopy: text("intro_copy"),
    completionHeadline: text("completion_headline"),
    completionCopy: text("completion_copy"),
    recordingMode: recordingModeEnum("recording_mode").notNull().default("quick_answers"),
    maxDurationSeconds: integer("max_duration_seconds").notNull().default(180),
    consentVersion: varchar("consent_version", { length: 20 }).notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("campaigns_org_slug_idx").on(table.organizationId, table.slug)],
);

export const campaignQuestions = pgTable(
  "campaign_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    // Null = shown to every audience on this campaign. Deliberately a flat
    // per-question audience filter, not a rules engine (spec Section 8).
    audience: relationshipEnum("audience"),
    promptText: text("prompt_text").notNull(),
    helpText: text("help_text"),
    order: integer("order").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [index("campaign_questions_campaign_idx").on(table.campaignId)],
);

// ---------------------------------------------------------------------------
// Contributors / Submissions
// ---------------------------------------------------------------------------

export const contributors = pgTable("contributors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  // Array, not a single value — a contributor can be e.g. both an alumnus
  // and a current staff member. Was a single scalar enum column before the
  // multi-select relationship feature (2026-08-13); see the migration that
  // introduced this for the backfill of existing single-value rows.
  relationship: relationshipEnum("relationship").array().notNull(),
  yearsAssociated: text("years_associated"),
  roleInfo: text("role_info"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "restrict" }),
    recordingMode: recordingModeEnum("recording_mode").notNull(),
    state: submissionStateEnum("state").notNull().default("STARTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    // Optional free-text answer to "What should we ask Coleman people next?",
    // collected on the completion screen AFTER the submission is finalized —
    // deliberately not one of the recorded questions (owner decision,
    // 2026-08-25): it's a suggestion box for the campaign, not part of the
    // contributor's story, so it must never gate or delay finalize. Nullable
    // for every submission that predates it and every contributor who skips
    // it, which is expected to be most of them.
    suggestedQuestion: text("suggested_question"),
  },
  (table) => [
    index("submissions_campaign_idx").on(table.campaignId),
    index("submissions_state_idx").on(table.state),
  ],
);

export const submissionAnswers = pgTable(
  "submission_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    // Null for Guided Story mode (one continuous recording, not per-question).
    campaignQuestionId: uuid("campaign_question_id").references(() => campaignQuestions.id, {
      onDelete: "set null",
    }),
    order: integer("order").notNull(),
  },
  (table) => [index("submission_answers_submission_idx").on(table.submissionId)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionAnswerId: uuid("submission_answer_id")
      .notNull()
      .references(() => submissionAnswers.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    durationSeconds: integer("duration_seconds"),
    byteSize: integer("byte_size"),
    status: mediaAssetStatusEnum("status").notNull().default("pending"),
    isOriginal: boolean("is_original").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [index("media_assets_submission_answer_idx").on(table.submissionAnswerId)],
);

// ---------------------------------------------------------------------------
// Email verification (OTP)
// ---------------------------------------------------------------------------

/**
 * One row per one-time code sent to a contributor's email during the
 * identity step (see docs/security.md and src/lib/auth/otp.ts). Not tied to
 * a `contributors` row by foreign key — verification happens BEFORE a
 * contributor/submission is created (that's the whole point: prove the
 * email is real before we act on it), so this table is keyed on the raw
 * email string instead. `codeHash` is an HMAC-SHA256 of the 6-digit code
 * (never the plaintext code) so a database read alone can't recover a
 * still-valid code, matching the project's existing "never store secrets
 * recoverably" posture (bcrypt for admin passwords, HMAC-signed tokens for
 * media URLs).
 */
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_verifications_email_idx").on(table.email)],
);

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    consentVersion: varchar("consent_version", { length: 20 }).notNull(),
    consentTextReference: text("consent_text_reference").notNull(),
    permittedUseClassification: text("permitted_use_classification").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    // IP is hashed (not stored raw) — see docs/security.md.
    acceptanceIpHash: text("acceptance_ip_hash"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("consent_records_submission_idx").on(table.submissionId)],
);

// ---------------------------------------------------------------------------
// Transcripts / Story Analysis
// ---------------------------------------------------------------------------

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    segments: jsonb("segments").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("transcripts_media_asset_idx").on(table.mediaAssetId)],
);

export const storyAnalyses = pgTable(
  "story_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    themes: text("themes").array().notNull().default(sql`'{}'::text[]`),
    pullQuotes: jsonb("pull_quotes").notNull(),
    marketingUseSuggestions: text("marketing_use_suggestions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    rawResponse: jsonb("raw_response"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    supersededBy: uuid("superseded_by"),
  },
  (table) => [index("story_analyses_submission_idx").on(table.submissionId)],
);

// ---------------------------------------------------------------------------
// Tags / Reviews
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: tagKindEnum("kind").notNull().default("manual"),
  },
  (table) => [uniqueIndex("tags_org_label_idx").on(table.organizationId, table.label)],
);

export const submissionTags = pgTable(
  "submission_tags",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("submission_tags_pk").on(table.submissionId, table.tagId)],
);

export const adminReviews = pgTable(
  "admin_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" })
      .unique(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    editorialState: editorialStateEnum("editorial_state").notNull().default("PENDING"),
    notes: text("notes"),
    favorite: boolean("favorite").notNull().default(false),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [index("admin_reviews_submission_idx").on(table.submissionId)],
);

// ---------------------------------------------------------------------------
// Processing / Audit / Analytics
// ---------------------------------------------------------------------------

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "cascade",
    }),
    jobType: jobTypeEnum("job_type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("processing_jobs_submission_idx").on(table.submissionId),
    index("processing_jobs_status_idx").on(table.status),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    eventType: text("event_type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_subject_idx").on(table.subjectType, table.subjectId)],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    submissionId: uuid("submission_id").references(() => submissions.id, {
      onDelete: "set null",
    }),
    // No testimonial content is ever stored here — see docs/architecture.md Section 10.
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("analytics_events_type_idx").on(table.eventType)],
);

// ---------------------------------------------------------------------------
// Relations (for query convenience)
// ---------------------------------------------------------------------------

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [campaigns.organizationId],
    references: [organizations.id],
  }),
  questions: many(campaignQuestions),
  submissions: many(submissions),
}));

export const campaignQuestionsRelations = relations(campaignQuestions, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignQuestions.campaignId],
    references: [campaigns.id],
  }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [submissions.campaignId], references: [campaigns.id] }),
  contributor: one(contributors, {
    fields: [submissions.contributorId],
    references: [contributors.id],
  }),
  answers: many(submissionAnswers),
  consentRecords: many(consentRecords),
  storyAnalyses: many(storyAnalyses),
  review: one(adminReviews, {
    fields: [submissions.id],
    references: [adminReviews.submissionId],
  }),
}));

export const submissionAnswersRelations = relations(submissionAnswers, ({ one, many }) => ({
  submission: one(submissions, {
    fields: [submissionAnswers.submissionId],
    references: [submissions.id],
  }),
  question: one(campaignQuestions, {
    fields: [submissionAnswers.campaignQuestionId],
    references: [campaignQuestions.id],
  }),
  mediaAssets: many(mediaAssets),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  answer: one(submissionAnswers, {
    fields: [mediaAssets.submissionAnswerId],
    references: [submissionAnswers.id],
  }),
  transcripts: many(transcripts),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  mediaAsset: one(mediaAssets, {
    fields: [transcripts.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));

export const storyAnalysesRelations = relations(storyAnalyses, ({ one }) => ({
  submission: one(submissions, {
    fields: [storyAnalyses.submissionId],
    references: [submissions.id],
  }),
}));
