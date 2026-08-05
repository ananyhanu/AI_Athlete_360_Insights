export const coachPerformanceLevels = [
  "Excellent",
  "Good",
  "Average",
  "Needs Improvement",
] as const;

export type CoachPerformanceLevel = (typeof coachPerformanceLevels)[number];

export type CoachPerformanceBand = {
  level: CoachPerformanceLevel;
  maximum: number;
  minimum: number;
  suggestedScore: number;
};

const coachPerformanceBands: readonly CoachPerformanceBand[] = [
  { level: "Excellent", maximum: 100, minimum: 85, suggestedScore: 90 },
  { level: "Good", maximum: 84, minimum: 70, suggestedScore: 77 },
  { level: "Average", maximum: 69, minimum: 50, suggestedScore: 60 },
  { level: "Needs Improvement", maximum: 49, minimum: 0, suggestedScore: 25 },
];

export function coachPerformanceBand(level: CoachPerformanceLevel): CoachPerformanceBand {
  const band = coachPerformanceBands.find((candidate) => candidate.level === level);
  if (!band) throw new Error(`Unsupported coach performance level: ${level}`);
  return band;
}

export function coachPerformanceLevelForScore(score: number): CoachPerformanceLevel | null {
  return coachPerformanceBands.find(
    (band) => Number.isInteger(score) && score >= band.minimum && score <= band.maximum,
  )?.level ?? null;
}

export function isCoachPerformanceScoreValid(score: number, level: CoachPerformanceLevel) {
  return coachPerformanceLevelForScore(score) === level;
}

export function coachPerformanceScoreError(score: number, level: CoachPerformanceLevel) {
  if (isCoachPerformanceScoreValid(score, level)) return null;

  const band = coachPerformanceBand(level);
  return `${level} scores must be whole numbers from ${band.minimum} to ${band.maximum}.`;
}