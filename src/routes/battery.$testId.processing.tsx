import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSelectedAthlete } from "@/lib/athletes";
import { getBatteryTest } from "@/lib/battery-tests";
import { LocalAssessmentRepository } from "@/lib/local-assessment-repository";
import { LocalCaptureRepository } from "@/lib/local-capture-repository";
import { analyzeVideoPose } from "@/lib/mediapipe-pose-analysis";
import { evaluateProvisionalCapture } from "@/lib/provisional-evaluator";

export const Route = createFileRoute("/battery/$testId/processing")({
  validateSearch: (search: Record<string, unknown>) => ({
    captureId: typeof search["captureId"] === "string" ? search["captureId"] : undefined,
    source: search["source"] === "upload" ? ("upload" as const) : ("record" as const),
  }),
  head: () => ({
    meta: [
      { title: "AI Processing — AI Athlete 360" },
      {
        name: "description",
        content: "Running local pose-quality analysis for a securely saved assessment capture.",
      },
      { property: "og:title", content: "AI Processing — AI Athlete 360" },
      { property: "og:description", content: "Local pose-quality analysis in progress." },
    ],
  }),
  component: AiProcessing,
});

const steps = [
  "Saving encrypted capture",
  "Checking capture metadata",
  "Running local pose analysis",
  "Preparing coach review",
  "Opening result",
];

const STEP_MS = 700;

function AiProcessing() {
  const navigate = useNavigate();
  const { testId } = useParams({ from: "/battery/$testId/processing" });
  const { captureId, source } = useSearch({ from: "/battery/$testId/processing" });
  const athlete = useSelectedAthlete();
  const [step, setStep] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s >= steps.length - 1 ? s : s + 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (step < steps.length - 1 || attemptId || saveError) return;
    if (!captureId) {
      setSaveError(
        "The secure capture ID is missing. Return to the test and record or upload the video again.",
      );
      return;
    }

    let active = true;
    const assessmentRepository = new LocalAssessmentRepository();
    const captureRepository = new LocalCaptureRepository();
    void (async () => {
      try {
        const capture = await captureRepository.getById(captureId);
        if (!capture || capture.athleteId !== athlete.id || capture.testId !== testId) {
          throw new Error("The selected capture is unavailable or does not match this assessment.");
        }

        const poseAnalysis = await analyzeVideoPose(capture.blob, capture.durationSeconds);
        const evaluation = evaluateProvisionalCapture(
          getBatteryTest(testId),
          { ...capture, athleteHeightCm: athlete.heightCm },
          poseAnalysis,
        );
        const attempt = await assessmentRepository.create({
          athleteId: athlete.id,
          captureId,
          evaluation,
          measurement: evaluation.measurement,
          source: source === "upload" ? "upload" : "camera",
          status: evaluation.state === "invalid-capture" ? "invalid" : "captured",
          testId,
        });

        if (!active) return;
        setAttemptId(attempt.id);
        navigate({
          to: "/battery/$testId/result",
          params: { testId },
          search: { attemptId: attempt.id, measurement: undefined },
        });
      } catch (error) {
        console.error(error);
        if (active) setSaveError("The assessment attempt could not be saved securely on this device.");
      } finally {
        assessmentRepository.close();
        captureRepository.close();
      }
    })();

    return () => {
      active = false;
    };
  }, [athlete.id, attemptId, captureId, navigate, saveError, source, step, testId]);

  const progress = Math.round(((step + 1) / steps.length) * 100);
  const remaining = ((steps.length - step - 1) * STEP_MS) / 1000;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-foreground px-8 py-12 text-center text-primary-foreground">
      <div className="relative grid size-28 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary-foreground/20" />
        <span className="absolute inset-3 animate-spin rounded-full border-4 border-primary-foreground/25 border-t-primary-foreground" />
        <span className="font-display text-lg font-bold">AI</span>
      </div>

      <h1 className="mt-8 text-2xl font-bold">Preparing Assessment Result</h1>
      <p className="mt-2 text-xs text-primary-foreground/75">
        Source: {source === "upload" ? "Uploaded video" : "Recorded video"}
      </p>
      {captureId ? (
        <p className="mt-1 text-xs text-primary-foreground/60">Capture saved for analysis</p>
      ) : null}
      <p className="mt-3 text-sm font-semibold text-primary-foreground/90">{steps[step]}</p>

      <div className="mt-5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-primary-foreground/20">
        <div
          className="h-full rounded-full bg-primary-foreground transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-primary-foreground/80">{progress}% complete</p>
      <p className="mt-1 text-xs text-primary-foreground/70">
        Local pose analysis runs on-device. Official scoring remains subject to approved protocols. {remaining.toFixed(0)}s remaining
      </p>
      {saveError ? (
        <p className="mt-3 text-sm font-semibold text-primary-foreground">{saveError}</p>
      ) : null}

      <ul className="mt-8 w-full max-w-xs space-y-1.5 text-left text-sm">
        {steps.map((label, i) => (
          <li
            key={label}
            className={
              i <= step ? "font-semibold text-primary-foreground" : "text-primary-foreground/55"
            }
          >
            {i < step ? "✓" : i === step ? "•" : "○"} {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
