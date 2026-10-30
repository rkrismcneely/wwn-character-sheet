/**
 * Multi-hour recap capacity and consent planning. This never dispatches AI or
 * media-processing jobs; estimates are an upper bound before speech detection.
 */
export type RecapInputLane = "craig-multitrack" | "audio-upload" | "timed-captions";
export type RecapProcessingPlan = {
  lane: RecapInputLane;
  durationMs: number;
  sourceTracks: number;
  maxSegmentMs: number;
  maxSegmentsPerTrack: number;
  maxSegmentsTotal: number;
  parallelTranscriptions: number;
  estimatedAudioMinutes: number;
  estimatedTranscriptionUsd: number | null;
  needsMediaDecoder: boolean;
  needsTranscription: boolean;
  stages: readonly string[];
};
export const RECAP_MAX_DURATION_MS = 8 * 60 * 60 * 1000;
export const RECAP_DEFAULT_SEGMENT_MS = 30_000;
export const RECAP_MAX_TRACKS = 32;

function requireValid(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Per-minute prices must be supplied from a currently verified pricing source. */
export function planRecapProcessing(input: {
  lane: RecapInputLane;
  durationMs: number;
  tracks: number;
  segmentMs?: number;
  parallelism?: number;
  transcriptionUsdPerMinute?: number;
}): RecapProcessingPlan {
  requireValid(["craig-multitrack", "audio-upload", "timed-captions"].includes(input.lane),
    "Unsupported recording source.");
  requireValid(Number.isSafeInteger(input.durationMs) && input.durationMs > 0 &&
    input.durationMs <= RECAP_MAX_DURATION_MS, "Recording duration exceeds the supported range.");
  requireValid(Number.isSafeInteger(input.tracks) && input.tracks >= 1 &&
    input.tracks <= RECAP_MAX_TRACKS, "Select 1–32 audio tracks.");
  requireValid(input.lane !== "audio-upload" || input.tracks === 1,
    "Uploaded single-track audio must not be labelled as Craig multitrack.");
  requireValid(input.lane !== "timed-captions" || input.tracks === 1,
    "Timed captions are one already-merged source. Speaker cues remain in captions.");
  const segmentMs = input.segmentMs ?? RECAP_DEFAULT_SEGMENT_MS;
  requireValid(Number.isSafeInteger(segmentMs) && segmentMs >= 10_000 &&
    segmentMs <= RECAP_DEFAULT_SEGMENT_MS, "Segment length must be 10–30 seconds.");
  const parallelism = input.parallelism ?? 2;
  requireValid(Number.isSafeInteger(parallelism) && parallelism >= 1 && parallelism <= 4,
    "Limit processing to 1–4 simultaneous transcription jobs.");
  requireValid(input.transcriptionUsdPerMinute === undefined ||
    (Number.isFinite(input.transcriptionUsdPerMinute) && input.transcriptionUsdPerMinute >= 0 &&
      input.transcriptionUsdPerMinute <= 1), "Invalid transcription rate.");

  const needsTranscription = input.lane !== "timed-captions";
  const needsMediaDecoder = input.lane !== "timed-captions";
  const maxSegmentsPerTrack = needsTranscription ? Math.ceil(input.durationMs / segmentMs) : 0;
  const maxSegmentsTotal = maxSegmentsPerTrack * (input.lane === "craig-multitrack" ? input.tracks : 1);
  const estimatedAudioMinutes = needsTranscription
    ? (input.durationMs / 60_000) * (input.lane === "craig-multitrack" ? input.tracks : 1) : 0;
  return {
    lane: input.lane,
    durationMs: input.durationMs,
    sourceTracks: input.tracks,
    maxSegmentMs: segmentMs,
    maxSegmentsPerTrack,
    maxSegmentsTotal,
    parallelTranscriptions: parallelism,
    estimatedAudioMinutes,
    estimatedTranscriptionUsd: input.transcriptionUsdPerMinute === undefined ? null
      : Math.round(estimatedAudioMinutes * input.transcriptionUsdPerMinute * 1000000) / 1000000,
    needsMediaDecoder,
    needsTranscription,
    stages: input.lane === "timed-captions"
      ? ["validate-captions", "attribute-speakers", "review-transcript", "draft-recap", "review-recap"]
      : ["ingest-source", "decode-and-synchronize", "detect-speech", "segment-audio",
        "transcribe-segments", "assemble-transcript", "review-transcript",
        "draft-recap", "review-recap"],
  };
}
