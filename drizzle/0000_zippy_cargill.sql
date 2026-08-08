CREATE TYPE "public"."actor_type" AS ENUM('contributor', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."editorial_state" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('transcription', 'analysis');--> statement-breakpoint
CREATE TYPE "public"."media_asset_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recording_mode" AS ENUM('quick_answers', 'guided_story');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('camper', 'staff', 'camper_staff', 'parent', 'alumni_parent', 'volunteer', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_state" AS ENUM('STARTED', 'RECORDING', 'UPLOADING', 'SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW', 'PROCESSING_FAILED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('ai_theme', 'manual');--> statement-breakpoint
CREATE TABLE "admin_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"admin_user_id" uuid,
	"editorial_state" "editorial_state" DEFAULT 'PENDING' NOT NULL,
	"notes" text,
	"favorite" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "admin_reviews_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"event_type" text NOT NULL,
	"campaign_id" uuid,
	"submission_id" uuid,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"audience" "relationship",
	"prompt_text" text NOT NULL,
	"help_text" text,
	"order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"hero_headline" text,
	"hero_subhead" text,
	"intro_copy" text,
	"completion_headline" text,
	"completion_copy" text,
	"recording_mode" "recording_mode" DEFAULT 'quick_answers' NOT NULL,
	"max_duration_seconds" integer DEFAULT 180 NOT NULL,
	"consent_version" varchar(20) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"consent_version" varchar(20) NOT NULL,
	"consent_text_reference" text NOT NULL,
	"permitted_use_classification" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acceptance_ip_hash" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"relationship" "relationship" NOT NULL,
	"years_associated" text,
	"role_info" text,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_answer_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"duration_seconds" integer,
	"byte_size" integer,
	"status" "media_asset_status" DEFAULT 'pending' NOT NULL,
	"is_original" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "organization_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_name" text DEFAULT 'Coleman Storybook' NOT NULL,
	"primary_color" varchar(20),
	"secondary_color" varchar(20),
	"accent_color" varchar(20),
	"logo_url" text,
	"font_heading" text,
	"font_body" text,
	"is_placeholder" boolean DEFAULT true NOT NULL,
	CONSTRAINT "organization_brands_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(80) NOT NULL,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"media_asset_id" uuid,
	"job_type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"pull_quotes" jsonb NOT NULL,
	"marketing_use_suggestions" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"raw_response" jsonb,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "submission_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"campaign_question_id" uuid,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_tags" (
	"submission_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"recording_mode" "recording_mode" NOT NULL,
	"state" "submission_state" DEFAULT 'STARTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" "tag_kind" DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"text" text NOT NULL,
	"segments" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_questions" ADD CONSTRAINT "campaign_questions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_submission_answer_id_submission_answers_id_fk" FOREIGN KEY ("submission_answer_id") REFERENCES "public"."submission_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_brands" ADD CONSTRAINT "organization_brands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_analyses" ADD CONSTRAINT "story_analyses_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_campaign_question_id_campaign_questions_id_fk" FOREIGN KEY ("campaign_question_id") REFERENCES "public"."campaign_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_tags" ADD CONSTRAINT "submission_tags_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_tags" ADD CONSTRAINT "submission_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_reviews_submission_idx" ON "admin_reviews" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "analytics_events_type_idx" ON "analytics_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "campaign_questions_campaign_idx" ON "campaign_questions" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_org_slug_idx" ON "campaigns" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "consent_records_submission_idx" ON "consent_records" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "media_assets_submission_answer_idx" ON "media_assets" USING btree ("submission_answer_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_submission_idx" ON "processing_jobs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "story_analyses_submission_idx" ON "story_analyses" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_answers_submission_idx" ON "submission_answers" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_tags_pk" ON "submission_tags" USING btree ("submission_id","tag_id");--> statement-breakpoint
CREATE INDEX "submissions_campaign_idx" ON "submissions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "submissions_state_idx" ON "submissions" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_label_idx" ON "tags" USING btree ("organization_id","label");--> statement-breakpoint
CREATE INDEX "transcripts_media_asset_idx" ON "transcripts" USING btree ("media_asset_id");