import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, QrCode, Sparkles, Target } from "lucide-react";
import { Share2 } from "lucide-react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import {
  DownloadCompleteSheet,
  GeneratingLabel,
  useReportDownload,
} from "@/components/ReportDownload";
import { ShareSheet, useShareSheet } from "@/components/ShareSheet";
import { useSelectedAthlete } from "@/lib/athletes";
import { assessmentMeta } from "@/lib/battery-tests";
import { useAssessmentSummary } from "@/lib/assessment-summary";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Assessment Report — AI Athlete 360" },
      {
        name: "description",
        content: "Provisional prototype report with fixture test results and a downloadable PDF.",
      },
      { property: "og:title", content: "Assessment Report — AI Athlete 360" },
      { property: "og:description", content: "Provisional athlete details and test fixtures." },
    ],
  }),
  component: Report,
});

function Report() {
  const athlete = useSelectedAthlete();
  const { loading, summary } = useAssessmentSummary(athlete.id);
  const share = useShareSheet();
  const { generating, pdf, download, close } = useReportDownload();

  const overall = summary.averageScore?.toFixed(1) ?? "N/A";
  const canDownloadReport = summary.completed > 0;
  const radarScores = useMemo(
    () =>
      summary.tests
        .map(({ attempt, test }) => ({
          name: compactTestName(test.name),
          score: attempt?.evaluation?.score,
        }))
        .filter((test): test is { name: string; score: number } => typeof test.score === "number"),
    [summary.tests],
  );
  const insight = summary.needsRetest
    ? `${summary.needsRetest} test${summary.needsRetest === 1 ? " needs" : "s need"} a retest before final review.`
    : summary.awaitingCoachReview
      ? `${summary.awaitingCoachReview} captured test${summary.awaitingCoachReview === 1 ? " is" : "s are"} ready for coach review.`
      : summary.accepted
        ? `${summary.accepted} accepted test${summary.accepted === 1 ? " is" : "s are"} included in this snapshot.`
        : "Capture the first assessment to unlock AI performance insights.";

  const details: [string, string][] = [
    ["Name", athlete.name],
    ["Athlete ID", athlete.athleteId],
    ["Age / Gender", `${athlete.age} yrs · ${athlete.gender}`],
    ["Sport / Event", `${athlete.sport} · ${athlete.event}`],
    ["BMI", String(athlete.bmi)],
    ["Coach", assessmentMeta.coachName],
    ["Assessment Date", assessmentMeta.date],
    ["Assessment ID", assessmentMeta.assessmentId],
  ];

  return (
    <AppShell wide title="Assessment Report" subtitle="Performance intelligence" backTo="/battery">
      <section className="fitness-panel-dark fitness-enter relative overflow-hidden border-l-4 border-primary p-6 text-background">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              AI performance report
            </p>
            <h2 className="mt-2 text-2xl font-bold">{athlete.name}</h2>
            <p className="mt-1 text-sm text-background/60">
              {athlete.sport} · {athlete.event}
            </p>
          </div>
          <span className="score-pulse grid size-14 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
            {overall}
          </span>
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-4 border-t border-background/10 pt-4">
          <ReportStat label="Captured" value={`${summary.completed}/${summary.total}`} />
          <ReportStat label="Accepted" value={String(summary.accepted)} />
          <ReportStat label="Avg score" value={overall} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <section className="fitness-panel p-5 lg:col-span-7">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            Athlete profile
          </p>
          <h2 className="mt-1 font-display text-lg font-bold">Provisional Assessment Report</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            This report is not an official assessment. Captured values remain provisional until
            protocols, scoring, and model validation are approved.
          </p>
          <dl className="mt-4 space-y-2">
            {details.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="fitness-panel p-5 lg:col-span-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">AI insight</p>
              <p className="mt-2 text-sm font-semibold leading-relaxed">{insight}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Scores remain provisional until the coach accepts the captured evidence.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                Performance profile
              </p>
              <h2 className="mt-1 text-sm font-bold">Assessment balance</h2>
            </div>
            <Target className="size-5 text-primary" />
          </div>
          {radarScores.length >= 3 ? (
            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarScores} outerRadius="66%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  />
                  <Radar
                    dataKey="score"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="glass-surface mt-3 grid h-32 place-items-center border-dashed px-5 text-center text-xs text-muted-foreground">
              Capture at least three evaluated tests to reveal the performance balance chart.
            </p>
          )}
        </section>

        <section className="fitness-panel lg:col-span-12 p-5">
          <h2 className="text-sm font-semibold">Test Results</h2>
          <div className="mt-3 space-y-3">
            {summary.tests.map(({ attempt, state, test }) => (
              <div
                key={test.id}
                className="action-lift rounded-xl bg-secondary p-4 hover:bg-accent hover:action-lift-hover"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold">{test.name}</span>
                  <span className="shrink-0 font-display text-sm font-bold text-primary">
                    {attempt?.evaluation?.score ?? "N/A"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {attempt?.measurement
                    ? `${attempt.measurement.value} ${attempt.measurement.unit}`
                    : "Not captured"}{" "}
                  · {formatTestState(state)}
                </p>
                {attempt?.evaluation?.score !== null && attempt?.evaluation?.score !== undefined ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="bg-gradient-primary h-full rounded-full"
                      style={{ width: `${attempt.evaluation.score}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="bg-gradient-primary flex items-center justify-between gap-4 rounded-2xl p-6 text-primary-foreground shadow-card lg:col-span-7">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/75">
              Average Captured Score
            </p>
            <p className="font-display text-4xl font-extrabold">{overall}</p>
          </div>
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
            Not validated
          </span>
        </div>

        <section className="fitness-panel grid place-items-center p-6 text-center lg:col-span-5">
          <div className="grid size-36 place-items-center rounded-2xl border-2 border-dashed border-primary/30 bg-secondary text-primary">
            <QrCode className="size-16" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Verification is unavailable in this prototype.
          </p>
        </section>

        <div className="lg:col-span-12 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => download(athlete, summary)}
            disabled={generating || loading || !canDownloadReport}
            className="bg-gradient-primary action-lift flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-primary-foreground shadow-card hover:action-lift-hover disabled:opacity-70"
          >
            {generating ? (
              <GeneratingLabel />
            ) : loading ? (
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
            className="fitness-panel action-lift flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-foreground hover:action-lift-hover"
          >
            <Share2 className="size-5 text-primary" />
            Share Result
          </button>

          <Link
            to="/dashboard"
            className="sm:col-span-2 flex h-12 items-center justify-center text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Back to Dashboard
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
        <ShareSheet open={share.open} onClose={share.hide} title="Share Assessment Report" />
      </div>
    </AppShell>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-background/55">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}

function formatTestState(
  state: "accepted" | "awaiting-coach-review" | "needs-retest" | "not-started",
) {
  return state === "accepted"
    ? "Accepted"
    : state === "awaiting-coach-review"
      ? "Awaiting coach review"
      : state === "needs-retest"
        ? "Retake required"
        : "Not started";
}

function compactTestName(name: string) {
  return name
    .replace("Standing ", "")
    .replace("Medicine Ball ", "Med. ")
    .replace("Endurance ", "End.");
}
