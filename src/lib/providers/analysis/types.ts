export interface PullQuote {
  text: string;
  startTime?: number;
  endTime?: number;
}

export interface StoryAnalysisResult {
  summary: string;
  themes: string[];
  pullQuotes: PullQuote[];
  marketingUseSuggestions: string[];
  provider: string;
  model: string;
  raw: unknown;
}

export interface StoryAnalysisProvider {
  analyze(input: {
    transcriptText: string;
    segments: { start: number; end: number; text: string }[];
  }): Promise<StoryAnalysisResult>;
}
