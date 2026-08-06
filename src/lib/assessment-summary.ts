import { useEffect, useState } from "react";
import { batteryTests, type BatteryTest } from "./battery-tests";
import type { AssessmentAttempt } from "./assessment-domain";
import { PersistentAssessmentRepository } from "./persistent-assessment-repository";

export type AssessmentTestState =
  | "accepted"
  | "awaiting-coach-review"
  | "needs-retest"
  | "not-started";

export type AssessmentTestSummary = {
  attempt: AssessmentAttempt | null;
  state: AssessmentTestState;
  test: BatteryTest;
};

export type AssessmentTrendPoint = {
  date: string;
  label: string;
  score: number;
};

export type AssessmentSummary = {
  accepted: number;
  attempts: readonly AssessmentAttempt[];
  averageScore: number | null;
  awaitingCoachReview: number;
  captured: number;
  completed: number;
  needsRetest: number;
  reportReady: boolean;
  syncPending: number;
  tests: readonly AssessmentTestSummary[];
  total: number;
  trend: readonly AssessmentTrendPoint[];
};

export function summarizeAssessment(attempts: readonly AssessmentAttempt[]): AssessmentSummary {
  const orderedAttempts = [...attempts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latestByTest = new Map<string, AssessmentAttempt>();
  for (const attempt of orderedAttempts) {
    if (!latestByTest.has(attempt.testId)) latestByTest.set(attempt.testId, attempt);
  }

  const tests = batteryTests.map((test) => summarizeTest(test, latestByTest.get(test.id) ?? null));
  const completed = tests.filter((test) => test.state !== "not-started").length;
  const accepted = tests.filter((test) => test.state === "accepted").length;
  const awaitingCoachReview = tests.filter((test) => test.state === "awaiting-coach-review").length;
  const needsRetest = tests.filter((test) => test.state === "needs-retest").length;
  const scores = tests
    .map((test) => test.attempt?.evaluation?.score)
    .filter((score): score is number => score !== null && score !== undefined);

  return {
    accepted,
    attempts: orderedAttempts,
    averageScore: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : null,
    awaitingCoachReview,
    captured: attempts.length,
    completed,
    needsRetest,
    reportReady: accepted === batteryTests.length,
    syncPending: attempts.filter((attempt) => attempt.syncState !== "synced").length,
    tests,
    total: batteryTests.length,
    trend: buildPerformanceTrend(attempts),
  };
}

export function buildPerformanceTrend(
  attempts: readonly AssessmentAttempt[],
): readonly AssessmentTrendPoint[] {
  const scoresByDate = new Map<string, number[]>();
  for (const attempt of attempts) {
    const score = attempt.evaluation?.score;
    if (score === null || score === undefined) continue;

    const date = attempt.updatedAt.slice(0, 10);
    const scores = scoresByDate.get(date) ?? [];
    scores.push(score);
    scoresByDate.set(date, scores);
  }

  return [...scoresByDate]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([date, scores]) => ({
      date,
      label: date.slice(5),
      score: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)),
    }));
}

export function useAssessmentSummary(athleteId: string) {
  const [summary, setSummary] = useState<AssessmentSummary>(() => summarizeAssessment([]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function refresh() {
      if (!athleteId) {
        if (active) setSummary(summarizeAssessment([]));
        return;
      }
      const repository = new PersistentAssessmentRepository(athleteId);
      try {
        const attempts = await repository.listForAthlete();
        if (active) setSummary(summarizeAssessment(attempts));
      } catch (error) {
        console.error(error);
        if (active) setSummary(summarizeAssessment([]));
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    return () => {
      active = false;
    };
  }, [athleteId]);

  return { loading, summary };
}

function summarizeTest(test: BatteryTest, attempt: AssessmentAttempt | null): AssessmentTestSummary {
  if (!attempt) return { attempt, state: "not-started", test };
  if (attempt.status === "invalid" || attempt.reviewStatus === "rejected") {
    return { attempt, state: "needs-retest", test };
  }
  if (attempt.reviewStatus === "accepted") return { attempt, state: "accepted", test };
  return { attempt, state: "awaiting-coach-review", test };
}