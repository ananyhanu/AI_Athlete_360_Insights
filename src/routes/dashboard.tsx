import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Clock,
  FileText,
  Gauge,
  History,
  LayoutGrid,
  Loader2,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { initials, useSelectedAthlete } from "@/lib/athletes";
import { batteryTestCount } from "@/lib/battery-tests";
import { useAssessmentSummary } from "@/lib/assessment-summary";
import { syncConfiguredAthletes } from "@/lib/athlete-sync-runtime";
import { assessmentApiBaseUrl, syncConfiguredAssessments } from "@/lib/assessment-sync-runtime";
import { hasSessionPermission, usePrototypeSession } from "@/lib/prototype-session";
import type { Permission } from "@/lib/authorization";
import { useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Coach Dashboard — AI Athlete 360" },
      {
        name: "description",
        content:
          "Coach dashboard with today's assessments, pending and completed tests, average fitness score and quick actions.",
      },
      { property: "og:title", content: "Coach Dashboard — AI Athlete 360" },
      {
        property: "og:description",
        content: "Track athletes, assessments and average scores at a glance.",
      },
    ],
  }),
  component: Dashboard,
});

const quickActions = [
  {
    label: "Register Athlete",
    to: "/register-athlete",
    icon: UserPlus,
    emoji: "👤",
    hint: "Add a new athlete profile",
    permission: "athlete:register",
  },
  {
    label: "Select Athlete",
    to: "/select-athlete",
    icon: Users,
    emoji: "📋",
    hint: "Pick who you are testing",
    permission: "athlete:read-assigned",
  },
  {
    label: "Start Assessment",
    to: "/battery",
    icon: Activity,
    emoji: "🏃",
    hint: "Run the provisional 10-test battery",
    permission: "assessment:perform",
  },
  {
    label: "Reports & History",
    to: "/history",
    icon: FileText,
    emoji: "📊",
    hint: "View, download and share",
    permission: "report:read-assigned",
  },
] as const;

function Dashboard() {
  const athlete = useSelectedAthlete();
  const session = usePrototypeSession();
  const { loading, summary } = useAssessmentSummary(athlete.id);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncApiBaseUrl = assessmentApiBaseUrl();
  const progress = Math.round((summary.accepted / summary.total) * 100);
  const stats = [
    { label: "Captured Tests", value: String(summary.completed), icon: ClipboardList },
    { label: "Awaiting Review", value: String(summary.awaitingCoachReview), icon: Clock },
    { label: "Accepted Tests", value: String(summary.accepted), icon: CheckCircle2 },
    { label: "Pending Sync", value: String(summary.syncPending), icon: Users },
  ];

  async function syncPendingAssessments() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const athleteResult = await syncConfiguredAthletes();
      if (!athleteResult.configured) {
        setSyncMessage(
          athleteResult.reason === "authentication-required"
            ? "Sign in to the assessment service before synchronizing records."
            : "Configure VITE_ASSESSMENT_API_URL before synchronizing assessment records.",
        );
        return;
      }

      const assessmentResult = await syncConfiguredAssessments();
      if (!assessmentResult.configured) {
        setSyncMessage("Sign in to the assessment service before synchronizing records.");
      } else if (athleteResult.failed || assessmentResult.failed) {
        setSyncMessage(
          `${athleteResult.synced} athlete(s) and ${assessmentResult.synced} assessment record(s) synchronized; ${athleteResult.failed + assessmentResult.failed} will retry when the service is available.`,
        );
      } else {
        const synced = athleteResult.synced + assessmentResult.synced;
        setSyncMessage(
          synced
            ? `${athleteResult.synced} athlete(s) and ${assessmentResult.synced} assessment record(s) synchronized.`
            : "No pending records.",
        );
      }
    } catch (error) {
      console.error(error);
      setSyncMessage("Synchronization could not be started. Pending records remain encrypted on this device.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell title="Coach Dashboard" subtitle={athlete.coach}>
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {quickActions.filter(({ permission }) => hasSessionPermission(session, permission)).map(({ label, to, emoji, hint, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="flex min-h-28 flex-col justify-between gap-2 rounded-2xl bg-secondary p-4 transition-transform active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="text-lg leading-none">{emoji}</span>
                <Icon className="size-4 text-primary" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
                  {hint}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-card p-4 shadow-card">
            <Icon className="size-5 text-primary" />
            <p className="mt-3 font-display text-2xl font-bold text-foreground">{value}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Assessment Synchronization</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.syncPending} pending encrypted record{summary.syncPending === 1 ? "" : "s"}
            </p>
          </div>
          <CloudUpload className="size-5 shrink-0 text-primary" />
        </div>
        <button
          onClick={() => void syncPendingAssessments()}
          disabled={syncing || !syncApiBaseUrl || summary.syncPending === 0}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-55"
        >
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          {syncing
            ? "Synchronizing"
            : !syncApiBaseUrl
              ? "Remote Sync Not Configured"
              : summary.syncPending === 0
                ? "All Records Synchronized"
                : "Sync Pending Records"}
        </button>
        {syncMessage ? <p className="mt-3 text-xs text-muted-foreground">{syncMessage}</p> : null}
        {!syncApiBaseUrl ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Set an HTTPS `VITE_ASSESSMENT_API_URL` to enable a configured remote service.
          </p>
        ) : null}
      </section>

      <div className="bg-gradient-primary mt-3 flex items-center gap-4 rounded-2xl p-5 text-primary-foreground shadow-card">
        <Gauge className="size-8 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-primary-foreground/75">
            Average Captured Score
          </p>
          <p className="font-display text-3xl font-bold">{summary.averageScore ?? "N/A"}</p>
        </div>
      </div>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold">Recent Athlete</h2>
        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <span className="bg-gradient-primary grid size-12 shrink-0 place-items-center rounded-2xl font-display text-sm font-bold text-primary-foreground">
            {initials(athlete.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{athlete.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {athlete.athleteId} · {athlete.sport}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-secondary px-3 py-2 text-center">
            <p className="font-display text-base font-bold text-foreground">{summary.accepted}</p>
            <p className="text-[10px] text-muted-foreground">Accepted Tests</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Last assessment: {athlete.lastAssessment}
        </p>
      </section>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between text-sm">
          <h2 className="font-semibold">Assessment Progress</h2>
          <span className="font-display text-lg font-bold text-primary">{progress}%</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="bg-gradient-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {summary.accepted} of {summary.total} tests accepted for the current athlete
        </p>
      </section>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Captured data is provisional and remains subject to coach review and protocol validation.
      </p>

      <section className="mt-3 rounded-2xl bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Weekly Score Trend</h2>
        {summary.trend.length ? (
          <div className="mt-4 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...summary.trend]} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="var(--chart-1)"
                  strokeWidth={3}
                  fill="url(#scoreFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 grid h-52 place-items-center text-center text-sm text-muted-foreground">
            {loading
              ? "Loading encrypted assessment history..."
              : "A score trend appears after evaluated captures are saved."}
          </p>
        )}
      </section>

      <section className="mt-3 rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Battery Fitness Assessment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run the provisional {batteryTestCount}-test workflow with coach review for every result.
        </p>
        <Link
          to="/select-athlete"
          className="mt-4 flex items-center gap-4 rounded-2xl bg-secondary p-4 transition-transform active:scale-[0.99]"
        >
          <span className="bg-gradient-primary grid size-12 shrink-0 place-items-center rounded-2xl text-primary-foreground">
            <Activity className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-bold">
              Battery Fitness Assessment Tests
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {batteryTestCount} tests · {summary.accepted}/{batteryTestCount} accepted
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          to="/history"
          className="flex items-center gap-2 rounded-2xl bg-card p-4 text-sm font-semibold shadow-card transition-transform active:scale-[0.98]"
        >
          <History className="size-4 text-primary" />
          History
        </Link>
        <Link
          to="/demo"
          className="flex items-center gap-2 rounded-2xl bg-card p-4 text-sm font-semibold shadow-card transition-transform active:scale-[0.98]"
        >
          <LayoutGrid className="size-4 text-primary" />
          Demo Screens
        </Link>
      </div>
    </AppShell>
  );
}
