export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  provider: string;
  model: string;
  raw: unknown;
}

export interface TranscriptionProvider {
  transcribe(input: { mediaUrl: string; mediaKey: string }): Promise<TranscriptionResult>;
}
