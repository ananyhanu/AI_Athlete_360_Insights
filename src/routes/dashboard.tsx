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
  CheckCircle2,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Dumbbell,
  Gauge,
  History,
  RotateCcw,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { initials, useSelectedAthlete } from "@/lib/athletes";
import { batteryTestCount } from "@/lib/battery-tests";
import { useAssessmentSummary } from "@/lib/assessment-summary";
import { hasSessionPermission, usePrototypeSession } from "@/lib/prototype-session";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Coach Dashboard — AI Athlete 360" },
      {
        name: "description",
        content: "Coach dashboard with athlete readiness, assessment status, and performance insights.",
      },
      { property: "og:title", content: "Coach Dashboard — AI Athlete 360" },
      { property: "og:description", content: "Track athlete assessments and performance insights at a glance." },
    ],
  }),
  component: Dashboard,
});

const quickActions = [
  { label: "Register Athlete", to: "/register-athlete", icon: UserPlus, hint: "Create profile", permission: "athlete:register" },
  { label: "Select Athlete", to: "/select-athlete", icon: ClipboardCheck, hint: "Choose athlete", permission: "athlete:read-assigned" },
  { label: "Start Assessment", to: "/battery", icon: Dumbbell, hint: "Run battery", permission: "assessment:perform" },
  { label: "Performance", to: "/athlete-performance", icon: ChartNoAxesCombined, hint: "Explore trends", permission: "report:read-assigned" },
] as const;

const statusColors = ["var(--chart-3)", "var(--chart-1)", "var(--destructive)", "var(--border)"];
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 0,
  color: "var(--foreground)",
  fontSize: 12,
};

function Dashboard() {
  const athlete = useSelectedAthlete();
  const session = usePrototypeSession();
  const { loading, summary } = useAssessmentSummary(athlete.id);
  const progress = Math.round((summary.accepted / summary.total) * 100);
  const statusData = [
    { name: "Accepted", value: summary.accepted },
    { name: "Review", value: summary.awaitingCoachReview },
    { name: "Retest", value: summary.needsRetest },
    { name: "Not started", value: summary.total - summary.completed },
  ];
  const scoreByTest = useMemo(
    () => summary.tests
      .map(({ attempt, test }) => ({ name: compactTestName(test.name), score: attempt?.evaluation?.score }))
      .filter((item): item is { name: string; score: number } => typeof item.score === "number"),
    [summary.tests],
  );
  const stats = [
    { label: "Captured", value: String(summary.completed), icon: ClipboardList, tone: "text-primary" },
    { label: "In review", value: String(summary.awaitingCoachReview), icon: Clock, tone: "text-chart-4" },
    { label: "Accepted", value: String(summary.accepted), icon: CheckCircle2, tone: "text-success" },
    { label: "Retest", value: String(summary.needsRetest), icon: RotateCcw, tone: "text-destructive" },
  ];

  return (
    <AppShell wide title="Coach Dashboard" subtitle={athlete.coach}>
      <div className="fitness-enter grid gap-4 [&>section]:min-w-0 lg:grid-cols-12">
        <section className="fitness-panel-dark relative overflow-hidden border-l-4 border-primary p-5 text-background lg:col-span-5">
          <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-primary/20 blur-3xl" />
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Active athlete</p>
          <div className="mt-4 flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center bg-primary font-display text-lg font-bold text-primary-foreground">
              {initials(athlete.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold">{athlete.name}</h2>
              <p className="truncate text-sm text-background/65">{athlete.athleteId} · {athlete.sport}</p>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between border-t border-background/15 pt-4">
            <div>
              <p className="text-xs text-background/60">Average performance</p>
              <p className="font-display text-3xl font-bold">{summary.averageScore ?? "N/A"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-background/60">Battery completion</p>
              <p className="font-display text-2xl font-bold text-primary">{progress}%</p>
            </div>
          </div>
        </section>

        <section className="fitness-panel p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Assessment readiness</p>
            <Gauge className="size-5 text-primary" />
          </div>
          <div className="mt-7 grid place-items-center">
            <div className="relative size-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={60} paddingAngle={2} stroke="none">
                    {statusData.map((item, index) => <Cell key={item.name} fill={statusColors[index]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <span className="absolute inset-0 grid place-items-center font-display text-xl font-bold">{summary.completed}/{summary.total}</span>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Tests captured in this battery</p>
        </section>

        <section className="fitness-panel p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Database persistence</p>
              <p className="mt-1 text-sm font-semibold">Assessment records are saved immediately</p>
            </div>
            <CheckCircle2 className="size-5 text-success" />
          </div>
          <p className="mt-6 text-xs text-muted-foreground">Profiles and completed assessment attempts are stored in the server database for the signed-in coach.</p>
        </section>

        {stats.map(({ label, value, icon: Icon, tone }) => (
          <section key={label} className="fitness-panel action-lift p-4 hover:action-lift-hover lg:col-span-3">
            <Icon className={`size-5 ${tone}`} />
            <p className="mt-5 font-display text-3xl font-bold">{value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          </section>
        ))}

        <section className="fitness-panel p-5 lg:col-span-5">
          <TileHeader icon={Activity} title="Weekly performance trend" detail="Average score by captured day" />
          {summary.trend.length ? (
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...summary.trend]} margin={{ left: -22, right: 4, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} score`, "Performance"]} />
                  <Area type="monotone" dataKey="score" stroke="var(--chart-1)" strokeWidth={3} fill="url(#scoreFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <ChartEmpty loading={loading} text="Weekly scores appear after evaluated captures are saved." />}
        </section>

        <section className="fitness-panel p-5 lg:col-span-4">
          <TileHeader icon={ChartNoAxesCombined} title="Performance by test" detail="Latest provisional score" />
          {scoreByTest.length ? (
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreByTest} layout="vertical" margin={{ left: 10, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} fontSize={11} width={92} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} score`, "Performance"]} />
                  <Bar dataKey="score" fill="var(--chart-1)" radius={0} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <ChartEmpty loading={loading} text="Test-level bars appear after a capture receives an AI score." />}
        </section>

        <section className="fitness-panel p-5 lg:col-span-3">
          <TileHeader icon={ClipboardList} title="Assessment status" detail="Current battery state" />
          <div className="mt-4 space-y-3">
            {statusData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><i className="size-2" style={{ backgroundColor: statusColors[index] }} />{item.name}</span>
                <span className="font-display text-lg font-bold">{item.value}</span>
              </div>
            ))}
          </div>
          <Link to="/battery" className="mt-7 flex items-center justify-between border-l-4 border-primary bg-secondary px-4 py-3 text-sm font-semibold transition-colors hover:bg-accent">
            Open assessment battery <ChevronRight className="size-4" />
          </Link>
        </section>

        <section className="fitness-panel p-5 lg:col-span-12">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Coach workspace</p>
              <h2 className="mt-1 text-lg font-bold">Common actions</h2>
            </div>
            <Link to="/history" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-foreground"><History className="size-4" />Assessment history</Link>
          </div>
          <div className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.filter(({ permission }) => hasSessionPermission(session, permission)).map(({ label, to, hint, icon: Icon }) => (
              <Link key={label} to={to} className="group flex min-h-28 flex-col justify-between bg-card p-4 transition-all hover:bg-foreground hover:shadow-elevated">
                <Icon className="size-5 text-primary group-hover:text-primary" />
                <span>
                  <span className="block text-sm font-semibold group-hover:text-background">{label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground group-hover:text-background/65">{hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function TileHeader({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Icon className="size-5 shrink-0 text-primary" />
    </div>
  );
}

function ChartEmpty({ loading, text }: { loading: boolean; text: string }) {
  return <p className="glass-surface mt-5 grid h-64 place-items-center border-dashed px-6 text-center text-sm text-muted-foreground">{loading ? "Loading encrypted assessment data..." : text}</p>;
}

function compactTestName(name: string) {
  return name.replace("Standing ", "").replace("Medicine Ball ", "Med. ").replace("Endurance ", "End.");
}
