import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Camera, CheckCircle2, ImageUp, Video } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSelectedAthlete } from "@/lib/athletes";
import { getBatteryTest, instructionsFor } from "@/lib/battery-tests";
import { evaluateManualRangeMeasurement } from "@/lib/ai-measurement";
import { LocalAssessmentRepository } from "@/lib/local-assessment-repository";

export const Route = createFileRoute("/battery/$testId/")({
  head: () => ({
    meta: [
      { title: "Start Test — AI Athlete 360" },
      {
        name: "description",
        content: "Athlete details, instructions and video capture for the selected battery test.",
      },
      { property: "og:title", content: "Start Test — AI Athlete 360" },
      { property: "og:description", content: "Record or upload the test video for AI analysis." },
    ],
  }),
  component: AssessmentScreen,
});

function AssessmentScreen() {
  const { testId } = useParams({ from: "/battery/$testId/" });
  const test = getBatteryTest(testId);
  const athlete = useSelectedAthlete();
  const navigate = useNavigate();
  const [manualValue, setManualValue] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);

  function start(source: "record" | "upload") {
    if (source === "record") {
      navigate({ to: "/battery/$testId/record", params: { testId: test.id } });
    } else {
      navigate({ to: "/battery/$testId/upload", params: { testId: test.id } });
    }
  }

  async function submitManualMeasurement() {
    const entry = test.manualEntry;
    const value = Number(manualValue);

    if (!entry || !Number.isFinite(value) || value < entry.min || value > entry.max) {
      setManualError(
        entry
          ? `Enter a value from ${entry.min} to ${entry.max} ${test.unit}.`
          : "This test is not configured for manual measurement.",
      );
      return;
    }

    setSavingManual(true);
    const repository = new LocalAssessmentRepository();
    try {
      const evaluation = evaluateManualRangeMeasurement(test, value);
      const attempt = await repository.create({
        athleteId: athlete.id,
        captureId: null,
        evaluation,
        measurement: evaluation.measurement,
        source: "manual",
        status: "completed",
        testId: test.id,
      });
      navigate({
        to: "/battery/$testId/result",
        params: { testId: test.id },
        search: { attemptId: attempt.id, measurement: undefined },
      });
    } catch (error) {
      console.error(error);
      setManualError("The measurement could not be saved securely on this device.");
    } finally {
      repository.close();
      setSavingManual(false);
    }
  }

  return (
    <AppShell title={test.name} subtitle="Start Test" backTo="/battery">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">Athlete Information</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Athlete Name" value={athlete.name} />
          <Row label="Athlete ID" value={athlete.athleteId} />
          <Row label="Sport / Event" value={`${athlete.sport} · ${athlete.event}`} />
          <Row label="Age / Gender" value={`${athlete.age} yrs · ${athlete.gender}`} />
          <Row label="BMI" value={String(athlete.bmi)} />
        </dl>
      </section>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">Before You Record</h2>
        <ul className="mt-3 space-y-2">
          {instructionsFor(test).map((line) => (
            <li key={line} className="flex gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {test.captureMode === "manual" && test.manualEntry ? (
        <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold">Coach Measurement</h2>
          <label className="mt-3 block text-sm font-medium text-foreground" htmlFor="manual-value">
            {test.manualEntry.label}
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="manual-value"
              type="number"
              inputMode="decimal"
              min={test.manualEntry.min}
              max={test.manualEntry.max}
              step={test.manualEntry.step}
              value={manualValue}
              onChange={(event) => {
                setManualValue(event.target.value);
                setManualError(null);
              }}
              aria-describedby="manual-value-help"
              className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">
              {test.unit}
            </span>
          </div>
          <p id="manual-value-help" className="mt-2 text-xs text-muted-foreground">
            Accepted range: {test.manualEntry.min}-{test.manualEntry.max} {test.unit}. The value is
            shown only in this prototype result.
          </p>
          {manualError ? (
            <p className="mt-2 text-sm font-medium text-destructive">{manualError}</p>
          ) : null}
          <button
            onClick={submitManualMeasurement}
            disabled={savingManual}
            className="bg-gradient-primary mt-4 flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98]"
          >
            {savingManual ? "Saving Securely..." : "Confirm Measurement"}
          </button>
        </section>
      ) : (
        <>
          <div className="mt-3 grid aspect-[4/3] w-full place-items-center rounded-3xl border-2 border-dashed border-primary/30 bg-secondary text-center shadow-card">
            <div className="px-6">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
                <Camera className="size-8" />
              </span>
              <p className="mt-4 font-display text-lg font-bold">Camera Preview</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Position the athlete fully in frame, side view, good lighting.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <button
              onClick={() => start("record")}
              className="bg-gradient-primary flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98]"
            >
              <Video className="size-5" />
              Record Video
            </button>
            <button
              onClick={() => start("upload")}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-semibold text-foreground shadow-card transition-transform active:scale-[0.98]"
            >
              <ImageUp className="size-5 text-primary" />
              Upload Video
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Securely save the video before the provisional result is prepared for coach review.
            </p>
          </div>
        </>
      )}
    </AppShell>
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
