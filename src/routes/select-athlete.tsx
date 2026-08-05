import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getSelectedAthleteId, initials, setSelectedAthleteId, useAthletes } from "@/lib/athletes";
import { assessmentMeta } from "@/lib/battery-tests";

export const Route = createFileRoute("/select-athlete")({
  head: () => ({
    meta: [
      { title: "Select Athlete — AI Athlete 360" },
      {
        name: "description",
        content:
          "Search and choose an athlete before starting the battery fitness assessment tests.",
      },
      { property: "og:title", content: "Select Athlete — AI Athlete 360" },
      { property: "og:description", content: "Pick an athlete to begin the assessment." },
    ],
  }),
  component: SelectAthlete,
});

function SelectAthlete() {
  const navigate = useNavigate();
  const athletes = useAthletes();
  const [language, setLanguage] = useState("en");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setSelected((current) => {
      const persisted = getSelectedAthleteId();
      if (persisted && athletes.some((athlete) => athlete.id === persisted)) return persisted;
      if (current && athletes.some((athlete) => athlete.id === current)) return current;
      return athletes[0]?.id ?? null;
    });
  }, [athletes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return athletes.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.athleteId.toLowerCase().includes(q) ||
        a.sport.toLowerCase().includes(q),
    );
  }, [athletes, query]);

  function handleContinue() {
    if (!selected) return;
    setSelectedAthleteId(selected);
    navigate({ to: "/battery" });
  }

  return (
    <AppShell title="Select Athlete" subtitle="Step 1 of 3" backTo="/dashboard">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-3 text-sm">
          <Users className="size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">Coach</span>
          <span className="ml-auto font-semibold">{assessmentMeta.coachName}</span>
        </div>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-muted-foreground">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </label>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-muted-foreground">Search Athlete</span>
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, ID or sport"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground"
            />
          </span>
        </label>
      </section>

      <section className="mt-3 rounded-2xl bg-card p-4 shadow-card">
        <h2 className="px-1 text-sm font-semibold">Athletes</h2>
        <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
          {filtered.map((a) => (
            <label
              key={a.id}
              className={`block cursor-pointer rounded-2xl border p-4 transition-colors ${
                selected === a.id ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="bg-gradient-primary grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl font-display text-sm font-bold text-primary-foreground">
                  {a.profilePhotoDataUrl ? (
                    <img src={a.profilePhotoDataUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(a.name)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.athleteId} · {a.sport}
                  </span>
                </span>
                <input
                  type="radio"
                  name="athlete"
                  value={a.id}
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                  className="size-5 shrink-0 accent-[var(--primary)]"
                />
              </span>
              <span className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <span className="rounded-xl bg-secondary px-2 py-2">
                  <span className="block font-semibold text-foreground">{a.age}</span>
                  <span className="block text-muted-foreground">Age</span>
                </span>
                <span className="rounded-xl bg-secondary px-2 py-2">
                  <span className="block font-semibold text-foreground">{a.bmi}</span>
                  <span className="block text-muted-foreground">BMI</span>
                </span>
                <span className="rounded-xl bg-secondary px-2 py-2">
                  <span className="block truncate font-semibold text-foreground">
                    {a.lastAssessment}
                  </span>
                  <span className="block text-muted-foreground">Last Test</span>
                </span>
              </span>
            </label>
          ))}
          {filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No athletes match “{query}”.
            </p>
          ) : null}
        </div>
      </section>

      <Link
        to="/register-athlete"
        className="mt-4 flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-secondary text-base font-semibold text-primary transition-transform active:scale-[0.98]"
      >
        <UserPlus className="size-5" />
        Register New Athlete
      </Link>

      <button
        onClick={handleContinue}
        disabled={!selected}
        className="bg-gradient-primary mt-3 flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70"
      >
        Continue
      </button>
    </AppShell>
  );
}
