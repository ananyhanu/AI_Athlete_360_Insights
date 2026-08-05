import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Info, Lightbulb, RefreshCw, Share2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  DownloadCompleteSheet,
  GeneratingLabel,
  useReportDownload,
} from "@/components/ReportDownload";
import { ShareSheet, useShareSheet } from "@/components/ShareSheet";
import { useSelectedAthlete } from "@/lib/athletes";
import { assessmentMeta, getBatteryTest } from "@/lib/battery-tests";
import type { AssessmentAttempt } from "@/lib/assessment-domain";
import {
  coachPerformanceBand,
  coachPerformanceLevelForScore,
  coachPerformanceLevels,
  coachPerformanceScoreError,
  isCoachPerformanceScoreValid,
  type CoachPerformanceLevel,
} from "@/lib/coach-performance-scoring";
import { LocalAssessmentRepository } from "@/lib/local-assessment-repository";
import { LocalCaptureRepository } from "@/lib/local-capture-repository";
import { analyzeVideoPose } from "@/lib/mediapipe-pose-analysis";
import { evaluateProvisionalCapture } from "@/lib/provisional-evaluator";
import { useAssessmentSummary } from "@/lib/assessment-summary";

export const Route = createFileRoute("/battery/$testId/result")({
  validateSearch: (search: Record<string, unknown>) => ({
    attemptId: typeof search["attemptId"] === "string" ? search["attemptId"] : undefined,
    measurement: typeof search["measurement"] === "string" ? search["measurement"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Test Result — AI Athlete 360" },
      {
        name: "description",
        content:
          "Provisional fixture result and coach-review notes for the battery test prototype.",
      },
      { property: "og:title", content: "Test Result — AI Athlete 360" },
      { property: "og:description", content: "Provisional battery test result for coach review." },
    ],
  }),
  component: AssessmentResult,
});

function AssessmentResult() {
  const { testId } = useParams({ from: "/battery/$testId/result" });
  const { attemptId, measurement } = Route.useSearch();
  const test = getBatteryTest(testId);
  const athlete = useSelectedAthlete();
  const { loading: loadingSummary, summary } = useAssessmentSummary(athlete.id);
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null);
  const [coachLevel, setCoachLevel] = useState<CoachPerformanceLevel>("Average");
  const [coachMetricValue, setCoachMetricValue] = useState("");
  const [coachScore, setCoachScore] = useState("");
  const [metricError, setMetricError] = useState<string | null>(null);
  const [reanalysisError, setReanalysisError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [savingMetric, setSavingMetric] = useState(false);
  const [updatingReview, setUpdatingReview] = useState(false);
  const share = useShareSheet();
  const { generating, pdf, download, close } = useReportDownload();

  useEffect(() => {
    if (!attemptId) {
      setAttempt(null);
      return;
    }

    let active = true;
    const repository = new LocalAssessmentRepository();
    void repository
      .getById(attemptId)
      .then((storedAttempt) => {
        if (active && storedAttempt?.athleteId === athlete.id && storedAttempt.testId === test.id) {
          setAttempt(storedAttempt);
          setCoachMetricValue(
            storedAttempt.measurement ? String(storedAttempt.measurement.value) : "",
          );
          setCoachScore(
            storedAttempt.evaluation?.score === null || storedAttempt.evaluation?.score === undefined
              ? ""
              : String(storedAttempt.evaluation.score),
          );
          if (
            storedAttempt.evaluation?.level &&
            storedAttempt.evaluation.level !== "Not scored"
          ) {
            setCoachLevel(storedAttempt.evaluation.level);
          }
        }
      })
      .catch(console.error)
      .finally(() => repository.close());

    return () => {
      active = false;
    };
  }, [athlete.id, attemptId, test.id]);

  const attemptMeasurement = attempt?.measurement;
  const displayedMeasurement = attemptMeasurement
    ? `${attemptMeasurement.value} ${attemptMeasurement.unit}`
    : (measurement ?? "No stored measurement");
  const evaluation = attempt?.evaluation;
  const displayedScore = evaluation?.score ?? null;
  const displayedLevel = evaluation?.level ?? "Not scored";
  const requiresCoachReview = attempt !== null && evaluation?.state !== "invalid-capture";
  const metricDefinition = test.manualEntry;
  const aiMeasurement = evaluation?.source === "mediapipe-pose" ? attempt?.measurement : null;
  const hasAiEstimate = aiMeasurement !== null;
  const hasManualRangeMetric = Boolean(
    attempt?.source === "manual" && evaluation?.source === "coach-validated",
  );
  const aiEstimateOutsideRange = Boolean(
    hasAiEstimate &&
      metricDefinition &&
      aiMeasurement &&
      (aiMeasurement.value < metricDefinition.min || aiMeasurement.value > metricDefinition.max),
  );
  const canEditCoachMetric = attempt?.reviewStatus === "awaiting-coach-review";
  const canReanalyze = Boolean(
    attempt?.captureId &&
      attempt.reviewStatus === "awaiting-coach-review" &&
      (!attempt.measurement || attempt.evaluation?.state === "invalid-capture"),
  );
  const canAccept = Boolean(
    attempt?.measurement &&
      evaluation?.score !== null &&
      evaluation?.score !== undefined &&
      evaluation.level !== "Not scored" &&
      evaluation.source === "coach-validated",
  );
  const canDownloadReport = summary.completed > 0;
  const scoreBand = coachPerformanceBand(coachLevel);
  const prototypeNotes = hasManualRangeMetric
    ? [
        "This recorded anthropometric metric is provisional until the coach accepts it.",
        "The allowed-range validation confirms the entry is plausible; it is not a sport-performance benchmark.",
      ]
    : test.observations;
  const recommendations = hasManualRangeMetric
    ? [
        "Confirm the measurement against the calibrated device before accepting the record.",
        "Use the approved anthropometric protocol for every athlete assessment.",
      ]
    : test.recommendations;

  function selectCoachLevel(level: CoachPerformanceLevel) {
    setCoachLevel(level);
    const currentScore = Number(coachScore);
    if (!coachScore.trim() || !isCoachPerformanceScoreValid(currentScore, level)) {
      setCoachScore(String(coachPerformanceBand(level).suggestedScore));
    }
    setMetricError(null);
  }

  function enterCoachScore(value: string) {
    setCoachScore(value);
    const score = Number(value);
    const matchedLevel = Number.isInteger(score) ? coachPerformanceLevelForScore(score) : null;
    if (matchedLevel) setCoachLevel(matchedLevel);
    setMetricError(null);
  }

  async function saveCoachMetric() {
    if (!attempt || !metricDefinition) return;

    const value = Number(coachMetricValue);
    const score = Number(coachScore);
    if (
      !coachMetricValue.trim() ||
      !Number.isFinite(value) ||
      value < metricDefinition.min ||
      value > metricDefinition.max
    ) {
      setMetricError(
        `Enter a result from ${metricDefinition.min} to ${metricDefinition.max} ${test.unit}.`,
      );
      return;
    }
    if (!coachScore.trim() || !Number.isInteger(score) || score < 0 || score > 100) {
      setMetricError("Enter a whole-number coach performance score from 0 to 100.");
      return;
    }
    const scoreError = coachPerformanceScoreError(score, coachLevel);
    if (scoreError) {
      setMetricError(scoreError);
      return;
    }

    setSavingMetric(true);
    setMetricError(null);
    const repository = new LocalAssessmentRepository();
    try {
      setAttempt(
        await repository.updateCoachMetricValidation(
          attempt.id,
          {
            level: coachLevel,
            measurement: { label: test.name, unit: test.unit, value },
            score,
          },
          attempt.version,
        ),
      );
    } catch (error) {
      console.error(error);
      setMetricError("The coach-validated result could not be saved. Refresh and try again.");
    } finally {
      repository.close();
      setSavingMetric(false);
    }
  }

  async function reanalyzeSavedCapture() {
    if (!attempt?.captureId) return;

    setReanalyzing(true);
    setReanalysisError(null);
    const assessmentRepository = new LocalAssessmentRepository();
    const captureRepository = new LocalCaptureRepository();
    try {
      const capture = await captureRepository.getById(attempt.captureId);
      if (!capture || capture.athleteId !== athlete.id || capture.testId !== test.id) {
        throw new Error("The saved video is unavailable or does not match this assessment.");
      }

      const poseAnalysis = await analyzeVideoPose(capture.blob, capture.durationSeconds);
      const evaluation = evaluateProvisionalCapture(
        test,
        { ...capture, athleteHeightCm: athlete.heightCm },
        poseAnalysis,
      );
      setAttempt(
        await assessmentRepository.updateGeneratedEvaluation(attempt.id, evaluation, attempt.version),
      );
    } catch (error) {
      console.error(error);
      setReanalysisError(
        error instanceof Error
          ? error.message
          : "The saved video could not be re-analyzed. Record or upload a new clip.",
      );
    } finally {
      assessmentRepository.close();
      captureRepository.close();
      setReanalyzing(false);
    }
  }

  async function updateReview(reviewStatus: "accepted" | "rejected") {
    if (!attempt) return;

    setUpdatingReview(true);
    setReviewError(null);
    const repository = new LocalAssessmentRepository();
    try {
      setAttempt(await repository.updateReviewStatus(attempt.id, reviewStatus, attempt.version));
    } catch (error) {
      console.error(error);
      setReviewError(
        error instanceof Error
          ? error.message
          : "The coach review could not be saved. Refresh and try again.",
      );
    } finally {
      repository.close();
      setUpdatingReview(false);
    }
  }

  return (
    <AppShell title="Test Result" subtitle={test.name} backTo="/battery">
      <div className="bg-gradient-primary rounded-3xl p-7 text-center text-primary-foreground shadow-card">
        <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/75">
          {evaluation?.state === "invalid-capture"
            ? "Capture Needs Retest"
            : hasAiEstimate
              ? "AI Estimated Result"
              : hasManualRangeMetric
                ? "Range-Validated Metric"
            : "Saved Provisional Attempt"}
        </p>
        <p className="font-display text-6xl font-extrabold">{displayedScore ?? "N/A"}</p>
        <p className="mt-1 text-sm text-primary-foreground/80">
          {test.name} · {displayedMeasurement}
        </p>
        <p className="mt-4 inline-flex rounded-full bg-primary-foreground/20 px-4 py-1 text-sm font-bold">
          {aiEstimateOutsideRange
            ? "COACH INTERVENTION REQUIRED"
            : requiresCoachReview
              ? "COACH REVIEW REQUIRED"
              : "RETAKE REQUIRED"}
        </p>
      </div>

      {displayedScore !== null ? (
        <div className="mt-3">
          <Stat
            label={hasManualRangeMetric ? "Allowed-range validation" : "Provisional score"}
            value={String(displayedScore)}
          />
        </div>
      ) : null}

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <dl className="space-y-2 text-sm">
          <Row label="Athlete Name" value={athlete.name} />
          <Row label="Athlete ID" value={athlete.athleteId} />
          <Row label="Sport" value={athlete.sport} />
          <Row label="Assessment ID" value={assessmentMeta.assessmentId} />
          <Row label="Test Name" value={test.name} />
          <Row
            label={hasAiEstimate ? "AI Measurement" : hasManualRangeMetric ? "Recorded Measurement" : "Measurement"}
            value={displayedMeasurement}
          />
          <Row label="Data Status" value={attempt ? "Provisional captured data" : "No saved attempt"} />
          <Row label="Review Status" value={formatReviewStatus(attempt?.reviewStatus)} />
          <Row
            label={hasAiEstimate ? "AI Provisional Rating" : hasManualRangeMetric ? "Allowed-range Status" : "Performance Rating"}
            value={displayedLevel}
          />
          <Row
            label="Evaluation"
            value={
              evaluation?.source === "mediapipe-pose"
                ? hasAiEstimate
                  ? "MediaPipe AI measurement estimate; coach validation required"
                  : "MediaPipe pose landmark analysis"
                : evaluation?.source === "analysis-unavailable"
                  ? "Pose analysis unavailable; metric requires coach validation"
                  : evaluation?.source === "coach-validated"
                    ? hasManualRangeMetric
                      ? "Coach-recorded metric within the allowed range"
                      : "Coach-validated measurement and performance score"
                : evaluation
                  ? "Assessment evaluation"
                  : "Not run"
            }
          />
        </dl>
      </section>

      {evaluation ? (
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold">Capture Validation</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {evaluation.validationReasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {canReanalyze ? (
            <button
              onClick={() => void reanalyzeSavedCapture()}
              disabled={reanalyzing}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-primary disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${reanalyzing ? "animate-spin" : ""}`} />
              {reanalyzing ? "Running AI Analysis..." : "Run AI Analysis Again"}
            </button>
          ) : null}
          {reanalysisError ? (
            <p className="mt-3 text-sm font-medium text-destructive">{reanalysisError}</p>
          ) : null}
        </section>
      ) : null}

      {evaluation?.poseEvidence ? (
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold">Pose Quality Evidence</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Row
              label="Detected frames"
              value={`${evaluation.poseEvidence.detectedFrames}/${evaluation.poseEvidence.analyzedFrames}`}
            />
            <Row
              label="Landmark visibility"
              value={`${Math.round(evaluation.poseEvidence.meanLandmarkVisibility * 100)}%`}
            />
            <Row
              label="Body in frame"
              value={`${Math.round(evaluation.poseEvidence.bodyInFrameRate * 100)}%`}
            />
            <Row label="Model" value="MediaPipe Lite v1" />
          </dl>
        </section>
      ) : null}

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Prototype Notes
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {prototypeNotes.map((o) => (
            <li key={o} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-primary" />
          Recommendations
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {recommendations.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-card p-5 shadow-card">
        <Info className="size-6 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Prototype Status</p>
          <p className="truncate text-sm text-muted-foreground">
            {hasAiEstimate
              ? "AI measurements are provisional and must be confirmed by a coach before acceptance."
              : hasManualRangeMetric
                ? "Recorded measurements are provisional until confirmed against a calibrated device."
                : "Pose quality may be analyzed locally. Coach-entered measurements and scores remain provisional."}
          </p>
        </div>
      </div>

      {attempt && requiresCoachReview && canEditCoachMetric && metricDefinition ? (
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold">
            {hasAiEstimate
              ? "Validate AI Estimate"
              : hasManualRangeMetric
                ? "Confirm Recorded Metric"
                : "Coach-Validated Result"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasAiEstimate
              ? "Review the AI estimate against the protocol, correct it if needed, and confirm the performance score."
              : hasManualRangeMetric
                ? "Confirm the value against the calibrated device before accepting this allowed-range validation."
                : "Enter the independently measured result and the coach's performance score. Video pose evidence is retained as capture-quality evidence only."}
          </p>
          <label className="mt-4 block text-sm font-medium" htmlFor="coach-metric-value">
            {metricDefinition.label}
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="coach-metric-value"
              type="number"
              inputMode="decimal"
              min={metricDefinition.min}
              max={metricDefinition.max}
              step={metricDefinition.step}
              value={coachMetricValue}
              onChange={(event) => {
                setCoachMetricValue(event.target.value);
                setMetricError(null);
              }}
              className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">{test.unit}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Accepted range: {metricDefinition.min}-{metricDefinition.max} {test.unit}.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm font-medium" htmlFor="coach-rating">
              Coach rating
              <select
                id="coach-rating"
                value={coachLevel}
                onChange={(event) => selectCoachLevel(event.target.value as CoachPerformanceLevel)}
                className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                {coachPerformanceLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium" htmlFor="coach-score">
              Coach score
              <input
                id="coach-score"
                type="number"
                inputMode="numeric"
                min={scoreBand.minimum}
                max={scoreBand.maximum}
                step="1"
                value={coachScore}
                onChange={(event) => enterCoachScore(event.target.value)}
                aria-describedby="coach-score-band"
                className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3 text-base font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
          <p id="coach-score-band" className="mt-2 text-xs text-muted-foreground">
            {coachLevel}: {scoreBand.minimum}-{scoreBand.maximum}. Suggested score: {scoreBand.suggestedScore}.
          </p>
          {metricError ? <p className="mt-3 text-sm font-medium text-destructive">{metricError}</p> : null}
          <button
            onClick={() => void saveCoachMetric()}
            disabled={savingMetric}
            className="bg-gradient-primary mt-4 flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {savingMetric ? "Saving Validated Result..." : "Save Coach-Validated Result"}
          </button>
        </section>
      ) : null}

      {attempt && requiresCoachReview ? (
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold">Coach Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm or reject this provisional attempt before it is used for a decision.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => updateReview("accepted")}
              disabled={updatingReview || attempt.reviewStatus === "accepted" || !canAccept}
              className="h-12 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Accept Validated Result
            </button>
            <button
              onClick={() => updateReview("rejected")}
              disabled={updatingReview || attempt.reviewStatus === "rejected"}
              className="h-12 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
            >
              Request Retest
            </button>
          </div>
          {reviewError ? (
            <p className="mt-3 text-sm font-medium text-destructive">{reviewError}</p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-5 space-y-3">
        <button
          onClick={() => download(athlete, summary)}
          disabled={generating || loadingSummary || !canDownloadReport}
          className="bg-gradient-primary flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {generating ? (
            <GeneratingLabel />
          ) : loadingSummary ? (
            "Loading assessment..."
          ) : !canDownloadReport ? (
            "No Captured Results"
          ) : (
            <>
              <Download className="size-5" />
              {summary.reportReady ? "Download Final Report" : "Download Provisional Report"}
            </>
          )}
        </button>
        <button
          onClick={share.show}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-semibold text-foreground shadow-card transition-transform active:scale-[0.98]"
        >
          <Share2 className="size-5 text-primary" />
          Share Result
        </button>
        <Link
          to="/battery"
          className="flex h-14 items-center justify-center rounded-2xl bg-secondary text-base font-semibold text-primary transition-transform active:scale-[0.98]"
        >
          Back to Assessment
        </Link>
      </div>

      <DownloadCompleteSheet
        pdf={pdf}
        onClose={close}
        onShare={() => {
          close();
          share.show();
        }}
      />
      <ShareSheet open={share.open} onClose={share.hide} title={`Share ${test.name} Result`} />
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 text-center shadow-card">
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto min-w-0 truncate font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function formatReviewStatus(status: AssessmentAttempt["reviewStatus"] | undefined) {
  if (!status) return "Awaiting coach review";
  return status.replaceAll("-", " ");
}
