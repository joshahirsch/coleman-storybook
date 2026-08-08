import type { StoryAnalysisProvider, StoryAnalysisResult } from "./types";

/**
 * Deterministic, clearly-labeled fake AI-analysis provider. Same rationale
 * as src/lib/providers/transcription/fake.ts — no AI vendor has been
 * selected/funded, and this lets the full Phase 9 pipeline (themes, pull
 * quotes, marketing suggestions, search) be built and tested without a paid
 * API call. Every row this produces has provider = "fake-local" and is
 * badged as synthetic in the admin UI.
 *
 * Pull quotes are always sourced verbatim from the transcript's own
 * segments — never fabricated — satisfying the "pull quotes must correspond
 * to source transcript" requirement even in fake mode.
 */

const THEME_KEYWORDS: Record<string, string[]> = {
  friendship: ["friend", "friendship", "bunk mate", "bunkmate"],
  belonging: ["belonging", "home", "family"],
  "jewish identity": ["jewish", "shabbat", "prayer", "identity"],
  leadership: ["leadership", "lead", "responsibility"],
  confidence: ["confidence"],
  independence: ["independence", "independent"],
  tradition: ["tradition", "campfire", "color war"],
  community: ["community", "together", "showing up"],
  mentorship: ["mentor", "taught me", "learned"],
  "staff experience": ["staff", "counselor", "working at"],
  family: ["family", "daughter", "brother", "cousin"],
  generations: ["generation", "years", "reunion"],
  "personal growth": ["grew", "growth", "changed", "influence"],
};

function detectThemes(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) found.push(theme);
  }
  return found.length > 0 ? found : ["camp memories"];
}

function summarize(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summarySentences = sentences.slice(0, 2);
  return summarySentences.join(" ");
}

export const fakeAnalysisProvider: StoryAnalysisProvider = {
  async analyze({ transcriptText, segments }): Promise<StoryAnalysisResult> {
    const themes = detectThemes(transcriptText);
    const summary = summarize(transcriptText);

    // Pick up to 2 real segments as pull quotes — never invented text.
    const pullQuotes = segments
      .filter((s) => s.text.split(/\s+/).length >= 8)
      .slice(0, 2)
      .map((s) => ({ text: s.text, startTime: s.start, endTime: s.end }));

    const marketingUseSuggestions: string[] = [];
    if (themes.includes("jewish identity") || themes.includes("tradition")) {
      marketingUseSuggestions.push("Candidate for High Holidays / tradition-themed email content.");
    }
    if (themes.includes("staff experience")) {
      marketingUseSuggestions.push("Candidate for staff recruitment page testimonial.");
    }
    if (themes.includes("friendship") || themes.includes("belonging")) {
      marketingUseSuggestions.push("Candidate for alumni recruitment / \"share your story\" social post.");
    }
    if (marketingUseSuggestions.length === 0) {
      marketingUseSuggestions.push("General testimonial — review for website quote use.");
    }

    return {
      summary,
      themes,
      pullQuotes,
      marketingUseSuggestions,
      provider: "fake-local",
      model: "deterministic-v1",
      raw: {
        note: "Synthetic analysis for development/testing. Not a real AI model call.",
        themeKeywordMatches: themes,
      },
    };
  },
};
