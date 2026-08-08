/**
 * Development seed data.
 *
 * Everything created here is explicitly SYNTHETIC (spec Section 31):
 * fictional contributors (Sarah Cohen, David Miller, Rachel Stein) with
 * fictionalized years/narratives, run through the real (fake-provider)
 * processing pipeline so the admin UI has something real to browse, search,
 * and filter during development — never to be presented as actual Camp
 * Coleman testimonials. Every synthetic contributor row has
 * `isSynthetic = true` so the admin UI can badge it clearly.
 *
 * Run with: npm run db:seed
 * (env loaded via `tsx --env-file=.env.local`, Node 22's native env-file support)
 */
import { eq } from "drizzle-orm";
import { db } from "./client";
import {
  adminUsers,
  campaignQuestions,
  campaigns,
  consentRecords,
  contributors,
  mediaAssets,
  organizationBrands,
  organizations,
  processingJobs,
  storyAnalyses,
  submissionAnswers,
  submissions,
  transcripts,
} from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { fakeTranscriptionProvider } from "@/lib/providers/transcription/fake";
import { fakeAnalysisProvider } from "@/lib/providers/analysis/fake";
import { getStorageAdapter } from "@/lib/storage";
import { writeLocalObject } from "@/lib/storage/local-adapter";

type Relationship = "camper" | "staff" | "camper_staff" | "parent" | "alumni_parent" | "volunteer" | "other";

function assertNotProduction() {
  // This script TRUNCATEs every table. Running it against a real production
  // database would be a catastrophic, irreversible data-loss incident — see
  // docs/pre-production-review.md (P0 finding, fixed). Refuse by default;
  // an operator who genuinely needs to seed a non-Camp-Coleman-production
  // environment that happens to have NODE_ENV=production (e.g. a staging
  // env deployed with production-like settings) must explicitly opt in.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_IN_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to run: NODE_ENV=production and ALLOW_SEED_IN_PRODUCTION is not set to \"true\". " +
        "This script destructively truncates every table. If you are certain this is not the real " +
        "Camp Coleman production database, set ALLOW_SEED_IN_PRODUCTION=true explicitly and re-run.",
    );
  }
}

async function resetDatabase() {
  // Dev-only convenience so `npm run db:seed` is safely re-runnable. Order
  // matters for FK constraints; TRUNCATE ... CASCADE would also work but
  // explicit deletes make the dependency order legible.
  assertNotProduction();
  const { sql: rawSql } = await import("drizzle-orm");
  await db.execute(rawSql`
    TRUNCATE TABLE
      analytics_events, audit_events, processing_jobs, submission_tags, tags,
      admin_reviews, story_analyses, transcripts, media_assets,
      submission_answers, consent_records, submissions, contributors,
      campaign_questions, campaigns, admin_users, organization_brands,
      organizations
    RESTART IDENTITY CASCADE
  `);
}

async function main() {
  console.log("Seeding Coleman Storybook dev database...");
  await resetDatabase();

  const [org] = await db
    .insert(organizations)
    .values({ name: "URJ Camp Coleman", slug: "camp-coleman", contactEmail: "info@campcoleman.org" })
    .returning();

  await db.insert(organizationBrands).values({
    organizationId: org.id,
    productName: "Coleman Storybook",
    isPlaceholder: true,
    primaryColor: "#1E3E32",
    secondaryColor: "#121E33",
    accentColor: "#E06A3E",
  });

  const passwordHash = await hashPassword("ColemanStorybook!Dev1");
  await db.insert(adminUsers).values({
    organizationId: org.id,
    email: "brian@campcoleman.org",
    passwordHash,
    displayName: "Brian (Dev Seed Admin)",
  });
  console.log(
    "Seeded admin login: brian@campcoleman.org / ColemanStorybook!Dev1 (DEV ONLY — change before any real deployment)",
  );

  const [alumniCampaign] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "alumni",
      title: "Alumni Stories",
      description: "For Camp Coleman alumni sharing memories from their camper years.",
      heroHeadline: "Your Coleman story matters.",
      heroSubhead: "Help us preserve the memories, friendships, traditions, and moments that make Coleman home.",
      introCopy:
        "It only takes a few minutes. We'll guide you through a few questions and record your answers using your phone or computer.",
      completionHeadline: "Your story is now part of the Coleman story.",
      completionCopy: "Todah rabah — thank you for sharing your Coleman story with us.",
      recordingMode: "quick_answers",
      maxDurationSeconds: 180,
      consentVersion: CURRENT_CONSENT_VERSION,
      tags: ["alumni"],
      active: true,
    })
    .returning();

  await db.insert(campaignQuestions).values([
    { campaignId: alumniCampaign.id, promptText: "Tell us your name and when you were at Coleman.", order: 0 },
    { campaignId: alumniCampaign.id, promptText: "What Coleman memory still makes you smile?", order: 1 },
    { campaignId: alumniCampaign.id, promptText: "Who did you meet at Coleman who changed your life?", order: 2 },
    {
      campaignId: alumniCampaign.id,
      promptText: "What did Coleman give you that you did not realize at the time?",
      order: 3,
    },
    { campaignId: alumniCampaign.id, promptText: "How did Coleman influence who you became?", order: 4 },
    { campaignId: alumniCampaign.id, promptText: "What would you tell someone considering Coleman today?", order: 5 },
  ]);

  const [staffCampaign] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "staff",
      title: "Staff Stories",
      description: "For current and former Camp Coleman staff.",
      heroHeadline: "Your Coleman story matters.",
      heroSubhead: "Tell us what working at Coleman meant to you.",
      introCopy:
        "It only takes a few minutes. We'll guide you through a few questions and record your answers using your phone or computer.",
      completionHeadline: "Your story is now part of the Coleman story.",
      completionCopy: "Todah rabah — thank you for sharing your Coleman story with us.",
      recordingMode: "quick_answers",
      maxDurationSeconds: 180,
      consentVersion: CURRENT_CONSENT_VERSION,
      tags: ["staff"],
      active: true,
    })
    .returning();

  await db.insert(campaignQuestions).values([
    { campaignId: staffCampaign.id, promptText: "What brought you to the Coleman staff?", order: 0 },
    { campaignId: staffCampaign.id, promptText: "What did working at Coleman teach you?", order: 1 },
    {
      campaignId: staffCampaign.id,
      promptText: "Tell us about a moment with a camper or coworker you still remember.",
      order: 2,
    },
    { campaignId: staffCampaign.id, promptText: "How did your Coleman experience influence what came next?", order: 3 },
  ]);

  const [parentsCampaign] = await db
    .insert(campaigns)
    .values({
      organizationId: org.id,
      slug: "parents",
      title: "Parent Stories",
      description: "For parents and alumni-parents of Camp Coleman campers.",
      heroHeadline: "Your Coleman story matters.",
      heroSubhead: "Tell us what Coleman has meant for your family.",
      introCopy:
        "It only takes a few minutes. We'll guide you through a few questions and record your answers using your phone or computer.",
      completionHeadline: "Your story is now part of the Coleman story.",
      completionCopy: "Todah rabah — thank you for sharing your Coleman story with us.",
      recordingMode: "quick_answers",
      maxDurationSeconds: 180,
      consentVersion: CURRENT_CONSENT_VERSION,
      tags: ["parents"],
      active: true,
    })
    .returning();

  await db.insert(campaignQuestions).values([
    { campaignId: parentsCampaign.id, promptText: "Tell us your name and your family's connection to Coleman.", order: 0 },
    {
      campaignId: parentsCampaign.id,
      promptText: "What changes have you noticed in your camper since they started at Coleman?",
      order: 1,
    },
    { campaignId: parentsCampaign.id, promptText: "What would you tell another parent considering Coleman?", order: 2 },
  ]);

  // Inactive campaign fixture — used to test the "disabled campaign" path
  // (spec Section 30 negative test list) and to demonstrate that campaigns
  // can be deactivated without deleting their data.
  await db.insert(campaigns).values({
    organizationId: org.id,
    slug: "friendships",
    title: "Friendship Stories (not yet launched)",
    description: "Reserved for a future themed campaign.",
    heroHeadline: "Your Coleman story matters.",
    consentVersion: CURRENT_CONSENT_VERSION,
    tags: ["friendships"],
    active: false,
  });

  // --- Synthetic contributors + submissions run through the real (fake-provider) pipeline ---
  const storage = getStorageAdapter();

  async function seedSubmission(opts: {
    campaign: { id: string; slug: string };
    first: string;
    last: string;
    relationship: Relationship;
    years: string;
    targetState: "SUBMITTED" | "READY_FOR_REVIEW" | "PROCESSING_FAILED";
    permittedUse: string;
  }) {
    const [contributor] = await db
      .insert(contributors)
      .values({
        organizationId: org.id,
        firstName: opts.first,
        lastName: opts.last,
        email: `${opts.first.toLowerCase()}.${opts.last.toLowerCase()}@example-synthetic.test`,
        relationship: opts.relationship,
        yearsAssociated: opts.years,
        isSynthetic: true,
      })
      .returning();

    const realQuestions = await db
      .select()
      .from(campaignQuestions)
      .where(eq(campaignQuestions.campaignId, opts.campaign.id));

    const [submission] = await db
      .insert(submissions)
      .values({
        campaignId: opts.campaign.id,
        contributorId: contributor.id,
        recordingMode: "quick_answers",
        state: "STARTED",
      })
      .returning();

    const orderedQuestions = realQuestions.sort((a, b) => a.order - b.order).slice(0, 2);
    const answerRows = orderedQuestions.map((q, i) => ({
      submissionId: submission.id,
      campaignQuestionId: q.id,
      order: i,
    }));
    const answers = await db.insert(submissionAnswers).values(answerRows).returning();

    await db.insert(consentRecords).values({
      submissionId: submission.id,
      consentVersion: CURRENT_CONSENT_VERSION,
      consentTextReference: "docs/legal-review-required.md#draft-consent",
      permittedUseClassification: opts.permittedUse,
      acceptanceIpHash: "seed-synthetic-no-ip",
      userAgent: "seed-script",
    });

    const createdMediaAssetIds: string[] = [];

    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      const key = storage.buildKey({
        organizationSlug: org.slug,
        submissionId: submission.id,
        answerId: answer.id,
        extension: "webm",
      });
      const fakeBytes = Buffer.from(`SYNTHETIC SEED MEDIA — not a real recording — ${key}`);
      await writeLocalObject(key, "video/webm", fakeBytes);

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          submissionAnswerId: answer.id,
          storageKey: key,
          mimeType: "video/webm",
          byteSize: fakeBytes.byteLength,
          durationSeconds: 45,
          status: "confirmed",
          confirmedAt: new Date(),
        })
        .returning();
      createdMediaAssetIds.push(asset.id);

      const shouldTranscribe = opts.targetState !== "PROCESSING_FAILED" || i === 0;
      if (shouldTranscribe) {
        // Deterministic per (contributor, question index) rather than the
        // real (randomly-generated) storage key, so re-running the seed
        // script always assigns the same synthetic story to the same
        // synthetic contributor — otherwise dev/demo/QA content shuffles on
        // every reseed, which is confusing and makes fixture-dependent
        // tests flaky. The real pipeline (src/lib/job-runner.ts) still
        // keys on the actual storage key, as it should.
        const transcriptionResult = await fakeTranscriptionProvider.transcribe({
          mediaUrl: key,
          mediaKey: `seed:${opts.first}:${opts.last}:${i}`,
        });
        await db.insert(transcripts).values({
          mediaAssetId: asset.id,
          text: transcriptionResult.text,
          segments: transcriptionResult.segments,
          provider: transcriptionResult.provider,
          model: transcriptionResult.model,
          rawResponse: transcriptionResult.raw as object,
        });
        await db.insert(processingJobs).values({
          submissionId: submission.id,
          mediaAssetId: asset.id,
          jobType: "transcription",
          status: "succeeded",
          attempts: 1,
        });
      } else {
        await db.insert(processingJobs).values({
          submissionId: submission.id,
          mediaAssetId: asset.id,
          jobType: "transcription",
          status: "failed",
          attempts: 3,
          lastError: "Synthetic seed failure: fake transcription provider simulated an unrecoverable error for demo purposes.",
        });
      }
    }

    if (opts.targetState === "READY_FOR_REVIEW") {
      const allTranscripts = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.mediaAssetId, createdMediaAssetIds[0]));
      const combinedText = allTranscripts.map((t) => t.text).join("\n\n");
      const combinedSegments = allTranscripts.flatMap(
        (t) => t.segments as { start: number; end: number; text: string }[],
      );
      const analysisResult = await fakeAnalysisProvider.analyze({
        transcriptText: combinedText,
        segments: combinedSegments,
      });
      await db.insert(storyAnalyses).values({
        submissionId: submission.id,
        summary: analysisResult.summary,
        themes: analysisResult.themes,
        pullQuotes: analysisResult.pullQuotes,
        marketingUseSuggestions: analysisResult.marketingUseSuggestions,
        provider: analysisResult.provider,
        model: analysisResult.model,
        rawResponse: analysisResult.raw as object,
      });
      await db.insert(processingJobs).values({
        submissionId: submission.id,
        jobType: "analysis",
        status: "succeeded",
        attempts: 1,
      });
    }

    await db
      .update(submissions)
      .set({ state: opts.targetState, submittedAt: new Date() })
      .where(eq(submissions.id, submission.id));

    return { submission, contributor };
  }

  await seedSubmission({
    campaign: alumniCampaign,
    first: "Sarah",
    last: "Cohen",
    relationship: "alumni_parent",
    years: "Camper 1998–2005",
    targetState: "READY_FOR_REVIEW",
    permittedUse: "full_permitted_use",
  });

  await seedSubmission({
    campaign: staffCampaign,
    first: "David",
    last: "Miller",
    relationship: "staff",
    years: "Staff 2010–2014",
    targetState: "READY_FOR_REVIEW",
    permittedUse: "website_and_social",
  });

  await seedSubmission({
    campaign: parentsCampaign,
    first: "Rachel",
    last: "Stein",
    relationship: "parent",
    years: "Parent since 2021",
    targetState: "SUBMITTED",
    permittedUse: "internal_review_only",
  });

  await seedSubmission({
    campaign: alumniCampaign,
    first: "Jordan",
    last: "Weiss",
    relationship: "camper_staff",
    years: "Camper 2005–2011, Staff 2012–2015",
    targetState: "PROCESSING_FAILED",
    permittedUse: "full_permitted_use",
  });

  console.log("Seed complete: 1 organization, 3 campaigns, 4 synthetic submissions across processing states.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
