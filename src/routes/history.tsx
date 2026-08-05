import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Download, Eye, Search, Share2, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  DownloadCompleteSheet,
  GeneratingLabel,
  useReportDownload,
} from "@/components/ReportDownload";
import { ShareSheet, useShareSheet } from "@/components/ShareSheet";
import { useSelectedAthlete } from "@/lib/athletes";
import { getBatteryTest } from "@/lib/battery-tests";
import { useAssessmentSummary } from "@/lib/assessment-summary";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Reports & History — AI Athlete 360" },
      {
        name: "description",
        content:
          "Search and filter past athlete assessments, then download, share or view any report again.",
      },
      { property: "og:title", content: "Reports & History — AI Athlete 360" },
      { property: "og:description", content: "Review, download and share previous reports." },
    ],
  }),
  component: HistoryScreen,
});

const filters = ["All", "Accepted", "Needs Review", "This Month"] as const;

function HistoryScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const athlete = useSelectedAthlete();
  const { loading, summary } = useAssessmentSummary(athlete.id);
  const share = useShareSheet();
  const { generating, pdf, download, close } = useReportDownload();

  const entries = useMemo(
    () =>
      summary.attempts.map((attempt) => {
        const test = getBatteryTest(attempt.testId);
        return {
          attempt,
          date: formatDate(attempt.updatedAt),
          score: attempt.evaluation?.score ?? null,
          status: historyStatus(attempt.status, attempt.reviewStatus),
          test,
        };
      }),
    [summary.attempts],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const matchQuery =
        !q ||
        athlete.name.toLowerCase().includes(q) ||
        athlete.sport.toLowerCase().includes(q) ||
        e.test.name.toLowerCase().includes(q);
      const matchFilter =
        filter === "All" ||
        (filter === "This Month"
          ? e.attempt.updatedAt.startsWith(new Date().toISOString().slice(0, 7))
          : e.status === filter);
      return matchQuery && matchFilter;
    });
  }, [athlete.name, athlete.sport, entries, filter, query]);

  function downloadReport() {
    void download(athlete, summary);
  }

  return (
    <AppShell title="Reports & History" subtitle={athlete.name} backTo="/dashboard">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <label className="flex h-12 items-center gap-3 rounded-2xl bg-secondary px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search athlete or sport"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? "bg-gradient-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </section>

      <h2 className="mt-5 text-sm font-semibold text-foreground">
        Assessment History ({visible.length})
      </h2>

      <div className="mt-3 space-y-3">
        {visible.map((e) => (
          <article key={e.attempt.id} className="rounded-2xl bg-card p-5 shadow-card">
            <div className="flex items-center gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
                <CalendarDays className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base font-bold">{e.test.name}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {e.date} · {e.attempt.source} · {e.status}
                </p>
              </div>
              <span className="font-display text-xl font-bold text-primary">{e.score ?? "N/A"}</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={downloadReport}
                disabled={generating || !summary.reportReady}
                className="flex flex-col items-center gap-1 rounded-xl bg-secondary py-3 text-[11px] font-semibold text-foreground transition-transform active:scale-[0.97] disabled:opacity-60"
              >
                <Download className="size-4 text-primary" />
                Download Again
              </button>
              <button
                onClick={share.show}
                className="flex flex-col items-center gap-1 rounded-xl bg-secondary py-3 text-[11px] font-semibold text-foreground transition-transform active:scale-[0.97]"
              >
                <Share2 className="size-4 text-primary" />
                Share Again
              </button>
              <Link
                to="/battery/$testId/result"
                params={{ testId: e.test.id }}
                search={{ attemptId: e.attempt.id, measurement: undefined }}
                className="flex flex-col items-center gap-1 rounded-xl bg-secondary py-3 text-[11px] font-semibold text-foreground transition-transform active:scale-[0.97]"
              >
                <Eye className="size-4 text-primary" />
                View Report
              </Link>
            </div>
          </article>
        ))}

        {visible.length === 0 ? (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
            {loading ? "Loading encrypted assessment history..." : "No captured assessments match your search."}
          </p>
        ) : null}
      </div>

      {generating ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
          <GeneratingLabel />
        </p>
      ) : null}

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function historyStatus(status: "captured" | "completed" | "invalid", reviewStatus: string) {
  if (status === "invalid" || reviewStatus === "rejected") return "Needs Review";
  return reviewStatus === "accepted" ? "Accepted" : "Needs Review";
}
