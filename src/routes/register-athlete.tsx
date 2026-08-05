import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { setSelectedAthleteId } from "@/lib/athletes";
import { LocalAthleteRepository } from "@/lib/local-athlete-repository";

export const Route = createFileRoute("/register-athlete")({
  head: () => ({
    meta: [
      { title: "Register Athlete — AI Athlete 360" },
      { name: "description", content: "Create a secure athlete profile for fitness assessment." },
    ],
  }),
  component: RegisterAthlete,
});

const fieldClass =
  "mt-1.5 h-12 w-full rounded-lg border border-border bg-secondary px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

const sportDisciplines: Record<string, readonly string[]> = {
  Athletics: ["100m Sprint", "200m Sprint", "400m Sprint", "Long Jump", "High Jump", "Shot Put"],
  Basketball: ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"],
  Football: ["Goalkeeper", "Defender", "Midfielder", "Forward"],
  Hockey: ["Goalkeeper", "Defender", "Midfielder", "Forward"],
  Kabaddi: ["Raider", "Defender", "All-rounder"],
  Wrestling: ["Freestyle", "Greco-Roman", "Women's Freestyle"],
};

const states = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
] as const;

function Field({
  id,
  label,
  children,
  required = false,
}: {
  id: string;
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground" htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function RegisterAthlete() {
  const navigate = useNavigate();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sport, setSport] = useState("");

  const age = useMemo(() => ageOnDate(dateOfBirth), [dateOfBirth]);
  const ageCategory = useMemo(() => ageCategoryFor(age), [age]);
  const isMinor = age !== null && age < 18;
  const disciplines = sport ? (sportDisciplines[sport] ?? []) : [];

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP profile photo.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Choose a profile photo smaller than 2 MB.");
      event.target.value = "";
      return;
    }

    setIsPhotoLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
      setIsPhotoLoading(false);
    };
    reader.onerror = () => {
      setIsPhotoLoading(false);
      toast.error("The profile photo could not be read. Please try another file.");
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setProfilePhotoDataUrl(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (isPhotoLoading) {
      toast.message("Please wait for the profile photo to finish processing.");
      return;
    }

    if (isMinor && !hasGuardian(form)) {
      toast.error("A guardian name, relationship, and mobile number are required for minors.");
      return;
    }

    setSaving(true);
    try {
      const athlete = await new LocalAthleteRepository().create(
        {
          address: {
            district: fieldValue(form, "district"),
            line1: fieldValue(form, "address"),
            line2: null,
            postalCode: fieldValue(form, "postal-code"),
            state: fieldValue(form, "state"),
            villageOrCity: fieldValue(form, "city"),
          },
          ageCategory,
          consentStatus: "granted",
          dateOfBirth,
          discipline,
          emailAddress: null,
          emergencyContact: null,
          fullName: fieldValue(form, "name"),
          gender: fieldValue(form, "gender") as
            "female" | "male" | "non-binary" | "self-describe" | "prefer-not-to-say",
          guardian: isMinor ? guardianContact(form) : null,
          heightCm: null,
          institutionName: fieldValue(form, "institution"),
          mobileNumber: fieldValue(form, "mobile"),
          profilePhotoDataUrl,
          sport,
          weightKg: null,
        },
        crypto.randomUUID(),
      );

      setSelectedAthleteId(athlete.id);
      toast.success("Athlete profile saved securely on this device.");
      navigate({ to: "/select-athlete" });
    } catch (error) {
      console.error(error);
      toast.error("Unable to save this profile. Check the required fields and consent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Register Athlete" subtitle="Required profile details" backTo="/dashboard" wide>
      <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-4">
        <section className="border-t-4 border-primary bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">New profile</p>
              <h2 className="mt-1 text-xl font-bold">Athlete essentials</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fields marked with * are required.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary text-primary">
                {profilePhotoDataUrl ? (
                  <img
                    src={profilePhotoDataUrl}
                    alt="Selected athlete profile"
                    className="size-full object-cover"
                  />
                ) : (
                  <Camera className="size-6" />
                )}
              </div>
              <div>
                <input
                  ref={photoInputRef}
                  id="profile-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
                <label
                  htmlFor="profile-photo"
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-primary/35 bg-secondary px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <ImagePlus className="size-4" />
                  {profilePhotoDataUrl ? "Change photo" : "Add photo"}
                </label>
                {profilePhotoDataUrl ? (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="ml-2 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Remove selected profile photo"
                    title="Remove photo"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional. JPEG, PNG or WebP, up to 2 MB.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Full name" required>
              <input id="name" required autoComplete="name" className={fieldClass} />
            </Field>
            <Field id="mobile" label="Mobile number" required>
              <input
                id="mobile"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                pattern="[0-9]{10}"
                title="Enter a 10-digit mobile number"
                className={fieldClass}
              />
            </Field>
            <Field id="dob" label="Date of birth" required>
              <input
                id="dob"
                required
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field id="gender" label="Gender" required>
              <select id="gender" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  Select gender
                </option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
                <option value="self-describe">Self-describe</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </Field>
          </div>

          {age !== null ? (
            <div className="mt-4 flex items-center gap-2 border-l-2 border-primary bg-secondary px-3 py-2 text-sm">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              <span>
                <strong>{age} years</strong> · {ageCategory}
                {isMinor ? " · guardian details required" : ""}
              </span>
            </div>
          ) : null}
        </section>

        <section className="bg-card p-5 shadow-card sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Assessment setup</p>
          <h2 className="mt-1 text-xl font-bold">Sport and location</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="sport" label="Sport" required>
              <select
                id="sport"
                required
                value={sport}
                onChange={(event) => {
                  setSport(event.target.value);
                  setDiscipline("");
                }}
                className={fieldClass}
              >
                <option value="" disabled>
                  Select sport
                </option>
                {Object.keys(sportDisciplines).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="discipline" label="Discipline / role" required>
              <select
                id="discipline"
                required
                disabled={!sport}
                value={discipline}
                onChange={(event) => setDiscipline(event.target.value)}
                className={fieldClass}
              >
                <option value="" disabled>
                  {sport ? "Select discipline or role" : "Select a sport first"}
                </option>
                {disciplines.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="institution" label="Academy or school" required>
              <input id="institution" required autoComplete="organization" className={fieldClass} />
            </Field>
            <Field id="state" label="State" required>
              <select id="state" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  Select state
                </option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="district" label="District" required>
              <input id="district" required autoComplete="address-level2" className={fieldClass} />
            </Field>
            <Field id="city" label="City or village" required>
              <input id="city" required autoComplete="address-level3" className={fieldClass} />
            </Field>
            <Field id="address" label="Address" required>
              <input id="address" required autoComplete="street-address" className={fieldClass} />
            </Field>
            <Field id="postal-code" label="Postal code" required>
              <input
                id="postal-code"
                required
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="[0-9]{6}"
                title="Enter a 6-digit postal code"
                className={fieldClass}
              />
            </Field>
          </div>
        </section>

        {isMinor ? (
          <section className="bg-card p-5 shadow-card sm:p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              Required for minors
            </p>
            <h2 className="mt-1 text-xl font-bold">Guardian details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field id="guardian-name" label="Guardian name" required>
                <input id="guardian-name" required autoComplete="name" className={fieldClass} />
              </Field>
              <Field id="guardian-relationship" label="Relationship" required>
                <select id="guardian-relationship" required defaultValue="" className={fieldClass}>
                  <option value="" disabled>
                    Select relationship
                  </option>
                  <option value="Parent">Parent</option>
                  <option value="Legal guardian">Legal guardian</option>
                  <option value="Caregiver">Caregiver</option>
                </select>
              </Field>
              <Field id="guardian-mobile" label="Guardian mobile" required>
                <input
                  id="guardian-mobile"
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="[0-9]{10}"
                  title="Enter a 10-digit mobile number"
                  className={fieldClass}
                />
              </Field>
            </div>
          </section>
        ) : null}

        <section className="border-l-4 border-primary bg-secondary p-5">
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              id="privacy-consent"
              type="checkbox"
              required
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            />
            <span>
              I confirm that the athlete, or their authorized guardian, has accepted the assessment
              and privacy consent for this profile.
            </span>
          </label>
        </section>

        <button
          type="submit"
          disabled={saving || isPhotoLoading}
          className="bg-gradient-primary flex h-14 w-full items-center justify-center rounded-lg text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {saving
            ? "Saving secure profile..."
            : isPhotoLoading
              ? "Processing photo..."
              : "Save athlete profile"}
        </button>
      </form>
    </AppShell>
  );
}

function ageOnDate(dateOfBirth: string) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) return null;

  const today = new Date();
  const birthdayThisYear = new Date(
    today.getFullYear(),
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );
  return today.getFullYear() - birthDate.getUTCFullYear() - Number(today < birthdayThisYear);
}

function ageCategoryFor(age: number | null) {
  if (age === null) return "Not calculated";
  if (age < 14) return "Under 14";
  if (age < 17) return "Under 17";
  if (age < 19) return "Under 19";
  return "Open";
}

function guardianContact(form: HTMLFormElement) {
  return {
    emailAddress: null,
    fullName: fieldValue(form, "guardian-name"),
    mobileNumber: fieldValue(form, "guardian-mobile"),
    relationship: fieldValue(form, "guardian-relationship"),
  };
}

function hasGuardian(form: HTMLFormElement) {
  return ["guardian-name", "guardian-relationship", "guardian-mobile"].every((id) =>
    fieldValue(form, id),
  );
}

function fieldValue(form: HTMLFormElement, id: string) {
  return form.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value.trim() ?? "";
}
