import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gauge,
  RotateCcw,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { initials, useSelectedAthlete } from "@/lib/athletes";
import { useAssessmentSummary, type AssessmentTestState } from "@/lib/assessment-summary";

export const Route = createFileRoute("/athlete-performance")({
  head: () => ({
    meta: [
      { title: "Athlete Performance — AI Athlete 360" },
      {
        name: "description",
        content: "Athlete performance dashboard with assessment readiness, trends, and test-level scores.",
      },
    ],
  }),
  component: AthletePerformance,
});

const statusColors = ["var(--chart-3)", "var(--chart-1)", "var(--destructive)", "var(--border)"];
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  color: "var(--foreground)",
  fontSize: 12,
};

function AthletePerformance() {
  const athlete = useSelectedAthlete();
  const { loading, summary } = useAssessmentSummary(athlete.id);
  const completion = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;
  const acceptedProgress = summary.total ? Math.round((summary.accepted / summary.total) * 100) : 0;
  const statusData = [
    { name: "Accepted", value: summary.accepted },
    { name: "In review", value: summary.awaitingCoachReview },
    { name: "Retest", value: summary.needsRetest },
    { name: "Not started", value: summary.total - summary.completed },
  ];
  const scoreByTest = useMemo(
    () =>
      summary.tests
        .map(({ attempt, state, test }) => ({
          measurement: attempt?.measurement
            ? `${attempt.measurement.value} ${attempt.measurement.unit}`
            : null,
          name: compactTestName(test.name),
          score: attempt?.evaluation?.score,
          state,
          testId: test.id,
        }))
        .filter((test): test is ScoredTest => typeof test.score === "number"),
    [summary.tests],
  );
  const scoreInsights = useMemo(() => {
    if (!scoreByTest.length) return { strongest: null, focus: null };
    const ordered = [...scoreByTest].sort((left, right) => left.score - right.score);
    return { focus: ordered[0], strongest: ordered[ordered.length - 1] };
  }, [scoreByTest]);
  const metricTiles = [
    { label: "Average score", value: summary.averageScore?.toFixed(1) ?? "N/A", icon: Gauge, tone: "text-primary" },
    { label: "Tests captured", value: `${summary.completed}/${summary.total}`, icon: ClipboardCheck, tone: "text-chart-4" },
    { label: "Accepted", value: String(summary.accepted), icon: CheckCircle2, tone: "text-success" },
    { label: "Retest needed", value: String(summary.needsRetest), icon: RotateCcw, tone: "text-destructive" },
  ];

  return (
    <AppShell title="Athlete Performance" subtitle="Assessment overview" backTo="/dashboard" wide>
      <div className="fitness-enter grid gap-4 [&>section]:min-w-0 lg:grid-cols-12">
        <section className="fitness-panel-dark relative overflow-hidden border-l-4 border-primary p-5 text-background lg:col-span-5">
          <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-primary/20 blur-3xl" />
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Current athlete</p>
          <div className="mt-4 flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden bg-primary font-display text-xl font-bold text-primary-foreground">
              {athlete.profilePhotoDataUrl ? (
                <img src={athlete.profilePhotoDataUrl} alt="" className="size-full object-cover" />
              ) : (
                initials(athlete.name)
              )}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold">{athlete.name}</h2>
              <p className="truncate text-sm text-background/65">
                {athlete.sport} · {athlete.event}
              </p>
              <p className="mt-1 truncate text-xs text-background/45">{athlete.athleteId}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-background/15 pt-4">
            <div>
              <p className="text-xs text-background/60">Assessment completion</p>
              <p className="mt-1 font-display text-3xl font-bold">{completion}%</p>
            </div>
            <div>
              <p className="text-xs text-background/60">Accepted battery</p>
              <p className="mt-1 font-display text-3xl font-bold text-primary">{acceptedProgress}%</p>
            </div>
          </div>
          <Link
            to="/select-athlete"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-background"
          >
            Switch athlete <ArrowUpRight className="size-4" />
          </Link>
        </section>

        <section className="fitness-panel p-5 lg:col-span-3">
          <TileHeading icon={Target} title="Assessment readiness" detail="Current test battery" />
          <div className="mt-5 grid place-items-center">
            <div className="relative aspect-square w-full max-w-32 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={43}
                    outerRadius={60}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statusData.map((status, index) => (
                      <Cell key={status.name} fill={statusColors[index]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <span className="absolute inset-0 grid place-items-center font-display text-xl font-bold">
                {summary.completed}/{summary.total}
              </span>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Tests captured in this battery</p>
        </section>

        <section className="fitness-panel p-5 lg:col-span-4">
          <TileHeading icon={Award} title="Performance snapshot" detail="Evaluated assessment scores" />
          {scoreInsights.strongest && scoreInsights.focus ? (
            <div className="mt-5 space-y-4">
              <InsightRow label="Strongest test" test={scoreInsights.strongest} tone="text-success" />
              <InsightRow label="Focus next" test={scoreInsights.focus} tone="text-primary" />
            </div>
          ) : (
            <ChartEmpty loading={loading} text="Insights appear after at least one test receives an AI score." compact />
          )}
        </section>

        {metricTiles.map(({ label, value, icon: Icon, tone }) => (
          <section key={label} className="fitness-panel action-lift p-4 hover:action-lift-hover lg:col-span-3">
            <Icon className={`size-5 ${tone}`} />
            <p className="mt-5 font-display text-3xl font-bold">{value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          </section>
        ))}

        <section className="fitness-panel p-5 lg:col-span-6">
          <TileHeading icon={TrendingUp} title="Performance trend" detail="Average score by captured day" />
          {summary.trend.length ? (
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...summary.trend]} margin={{ left: -20, right: 4, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="athleteScoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.42} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} score`, "Performance"]} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    fill="url(#athleteScoreFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty loading={loading} text="Trend data appears when evaluated captures are saved." />
          )}
        </section>

        <section className="fitness-panel p-5 lg:col-span-6">
          <TileHeading icon={BarChart3} title="Score by test" detail="Latest provisional score for each evaluated test" />
          {scoreByTest.length ? (
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreByTest} layout="vertical" margin={{ left: 10, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} fontSize={11} width={102} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} score`, "Performance"]} />
                  <Bar dataKey="score" fill="var(--chart-1)" maxBarSize={20} radius={0} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmpty loading={loading} text="Test comparison appears after a capture receives an AI score." />
          )}
        </section>

        <section className="fitness-panel p-5 lg:col-span-12">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Battery detail</p>
              <h2 className="mt-1 text-lg font-bold">Test performance</h2>
            </div>
            <Link to="/battery" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground">
              Run assessment <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {summary.tests.map(({ attempt, state, test }) => (
              <div key={test.id} className="action-lift min-w-0 bg-card p-4 hover:bg-secondary hover:action-lift-hover">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold">{test.name}</p>
                  <span className={`shrink-0 text-xs font-bold ${stateTone(state)}`}>{stateLabel(state)}</span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Measurement</p>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {attempt?.measurement
                        ? `${attempt.measurement.value} ${attempt.measurement.unit}`
                        : "Not captured"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Score</p>
                    <p className="mt-1 font-display text-2xl font-bold text-primary">
                      {attempt?.evaluation?.score ?? "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

type ScoredTest = {
  measurement: string | null;
  name: string;
  score: number;
  state: AssessmentTestState;
  testId: string;
};

function TileHeading({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Icon className="size-5 shrink-0 text-primary" />
    </div>
  );
}

function InsightRow({ label, test, tone }: { label: string; test: ScoredTest; tone: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-l-2 border-border pl-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold">{test.name}</p>
      </div>
      <p className={`font-display text-2xl font-bold ${tone}`}>{test.score}</p>
    </div>
  );
}

function ChartEmpty({ loading, text, compact = false }: { loading: boolean; text: string; compact?: boolean }) {
  return (
    <p
      className={`glass-surface mt-5 grid place-items-center border-dashed px-6 text-center text-sm text-muted-foreground ${compact ? "h-32" : "h-64"}`}
    >
      {loading ? "Loading encrypted assessment data..." : text}
    </p>
  );
}

function stateLabel(state: AssessmentTestState) {
  return state === "accepted"
    ? "Accepted"
    : state === "awaiting-coach-review"
      ? "In review"
      : state === "needs-retest"
        ? "Retest"
        : "Not started";
}

function stateTone(state: AssessmentTestState) {
  return state === "accepted"
    ? "text-success"
    : state === "awaiting-coach-review"
      ? "text-primary"
      : state === "needs-retest"
        ? "text-destructive"
        : "text-muted-foreground";
}

function compactTestName(name: string) {
  return name.replace("Standing ", "").replace("Medicine Ball ", "Med. ").replace("Endurance ", "End.");
}