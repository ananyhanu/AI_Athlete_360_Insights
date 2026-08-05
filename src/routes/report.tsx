import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, QrCode } from "lucide-react";
import { Share2 } from "lucide-react";
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
    <AppShell title="Assessment Report" subtitle="Battery Fitness Test" backTo="/battery">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Prototype fixture
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

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">Test Results</h2>
        <div className="mt-3 space-y-3">
          {summary.tests.map(({ attempt, state, test }) => (
            <div key={test.id} className="rounded-xl bg-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold">{test.name}</span>
                <span className="shrink-0 font-display text-sm font-bold text-primary">
                  {attempt?.evaluation?.score ?? "N/A"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {attempt?.measurement
                  ? `${attempt.measurement.value} ${attempt.measurement.unit}`
                  : "Not captured"} · {formatTestState(state)}
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

      <div className="bg-gradient-primary mt-3 flex items-center justify-between gap-4 rounded-2xl p-6 text-primary-foreground shadow-card">
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

      <section className="mt-3 grid place-items-center rounded-2xl bg-card p-6 text-center shadow-card">
        <div className="grid size-36 place-items-center rounded-2xl border-2 border-dashed border-primary/30 bg-secondary text-primary">
          <QrCode className="size-16" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Verification is unavailable in this prototype.
        </p>
      </section>

      <button
        onClick={() => download(athlete, summary)}
        disabled={generating || loading || !canDownloadReport}
        className="bg-gradient-primary mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70"
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
        className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-semibold text-foreground shadow-card transition-transform active:scale-[0.98]"
      >
        <Share2 className="size-5 text-primary" />
        Share Result
      </button>

      <Link
        to="/dashboard"
        className="mt-3 flex h-14 items-center justify-center rounded-2xl border border-border bg-card text-base font-semibold text-foreground"
      >
        Back to Dashboard
      </Link>

      <DownloadCompleteSheet
        pdf={pdf}
        onClose={close}
        onShare={() => {
          close();
          share.show();
        }}
      />
      <ShareSheet open={share.open} onClose={share.hide} title="Share Assessment Report" />
    </AppShell>
  );
}

function formatTestState(state: "accepted" | "awaiting-coach-review" | "needs-retest" | "not-started") {
  return state === "accepted"
    ? "Accepted"
    : state === "awaiting-coach-review"
      ? "Awaiting coach review"
      : state === "needs-retest"
        ? "Retake required"
        : "Not started";
}
