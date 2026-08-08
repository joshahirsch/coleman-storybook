import { createHash } from "node:crypto";
import type { TranscriptionProvider, TranscriptionResult } from "./types";

/**
 * Deterministic, clearly-labeled fake transcription provider.
 *
 * IMPORTANT: this does NOT perform real speech-to-text. It exists so the
 * processing pipeline (Phase 8/9), admin UI, and search (Phase 10) can be
 * built, demonstrated, and automatically tested end-to-end without an API
 * key or any paid vendor call — per the spec's "use mocks/fakes in
 * automated tests to avoid unnecessary paid calls" instruction, and because
 * no transcription vendor has been chosen/funded yet (see
 * docs/decision-log.md and docs/cost-model.md).
 *
 * Every persisted Transcript row from this provider has
 * provider = "fake-local" and model = "deterministic-v1" so it can never be
 * mistaken for a real transcript in the database or admin UI (the admin UI
 * additionally renders a visible "SYNTHETIC — not a real transcript" badge
 * whenever provider === "fake-local").
 *
 * The sample stories below are entirely fictional, written for this
 * project, and loosely themed around Camp Coleman's own public messaging
 * (friendship, belonging, Jewish identity, generations) captured in
 * docs/brand-audit.md — they are NOT real Camp Coleman testimonials and
 * must never be presented as such.
 */

const SAMPLE_STORIES: string[] = [
  "My name is Sarah and I was a camper at Coleman from nineteen ninety eight to two thousand five. The memory that still makes me smile is the first night of color war, when my whole cabin stayed up talking under the stars instead of sleeping, because none of us wanted the summer to end. I met my best friend there, and twenty years later we still call each other every year on the day camp started. Coleman gave me a sense of belonging I did not realize I was missing until I found it. If someone today is considering Coleman, I would tell them: go all in, because the friendships are the kind that last a lifetime.",
  "I came to work on the Coleman staff almost by accident, my cousin talked me into it one summer, and it ended up changing the direction of my whole career. What working at Coleman taught me was patience, and how much responsibility a nineteen year old can actually rise to when kids are counting on you. There was one Shabbat service where a camper who had been homesick all week stood up on his own to lead a prayer, and the whole room went quiet. I think about that moment more than almost anything else from those summers. It shaped how I think about leadership and community to this day.",
  "I am a Coleman parent, and I want to say clearly: sending my daughter to camp was one of the best decisions our family ever made. She came home with more confidence and more independence than I expected, and she talks about her bunk mates like family. What I did not expect was how much the Jewish identity piece would matter to her, in a way that felt joyful rather than like homework. From generation to generation really does describe what happens there. We are already planning for her little brother to go next summer.",
  "David here — I was camper, then staff, then camper again in spirit every time I visit for alumni weekend. The tradition I remember most is the very last campfire of the session, when the whole camp sings together and nobody wants to be the one who leaves first. What Coleman gave me that I did not realize at the time was a template for what community should feel like — kind, a little bit loud, and built on showing up for each other. It influenced who I became more than most of what I learned in school, honestly.",
  "My name is Rachel. I volunteered with the Coleman alumni committee for a few years after college, mostly because I was not ready to let go of the place. Helping plan reunion events taught me that camp does not really end when the summer does — it just changes shape. The friendships I made as a camper turned into friendships I get to keep as an adult, which is rarer than people think. If you are on the fence about staying connected to Coleman after you age out, my advice is simple: stay connected. It is worth it.",
];

function pickIndex(key: string, modulo: number): number {
  const hash = createHash("sha256").update(key).digest();
  return hash[0] % modulo;
}

function toSegments(text: string): TranscriptionResult["segments"] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let cursor = 0;
  const segments = sentences.map((sentence) => {
    // Rough synthetic timing: ~150ms per word, purely for UI demonstration.
    const wordCount = sentence.split(/\s+/).length;
    const duration = Math.max(1.5, wordCount * 0.4);
    const start = cursor;
    const end = cursor + duration;
    cursor = end;
    return { start: Number(start.toFixed(1)), end: Number(end.toFixed(1)), text: sentence };
  });
  return segments;
}

export const fakeTranscriptionProvider: TranscriptionProvider = {
  async transcribe({ mediaKey }) {
    const text = SAMPLE_STORIES[pickIndex(mediaKey, SAMPLE_STORIES.length)];
    return {
      text,
      segments: toSegments(text),
      provider: "fake-local",
      model: "deterministic-v1",
      raw: { note: "Synthetic transcript for development/testing. Not real speech-to-text output.", mediaKey },
    };
  },
};
