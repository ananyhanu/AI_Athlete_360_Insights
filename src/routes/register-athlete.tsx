import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { setSelectedAthleteId } from "@/lib/athletes";
import { LocalAthleteRepository } from "@/lib/local-athlete-repository";

export const Route = createFileRoute("/register-athlete")({
  head: () => ({
    meta: [
      { title: "Register Athlete — AI Athlete 360" },
      {
        name: "description",
        content:
          "Register an athlete with personal, sport, physical, contact and medical details for assessment.",
      },
      { property: "og:title", content: "Register Athlete — AI Athlete 360" },
      { property: "og:description", content: "Add a new athlete to your assessment roster." },
    ],
  }),
  component: RegisterAthlete,
});

const fieldClass =
  "mt-2 h-13 w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-base outline-none focus:border-primary";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <label className="block text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-3xl bg-card p-5 shadow-card">
      <h2 className="text-sm font-bold uppercase tracking-wider text-primary">{title}</h2>
      {children}
    </section>
  );
}

function RegisterAthlete() {
  const navigate = useNavigate();
  const [dob, setDob] = useState("");
  const [height, setHeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [weight, setWeight] = useState("");

  const age = useMemo(() => {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return "--";
    const diff = Date.now() - d.getTime();
    return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
  }, [dob]);

  const bmi = useMemo(() => {
    const h = Number(height) / 100;
    const w = Number(weight);
    if (!h || !w) return "--";
    return (w / (h * h)).toFixed(1);
  }, [height, weight]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const guardian = optionalContact(form, "guardian");

    if (Number(age) < 18 && !guardian) {
      toast.error("A parent or guardian is required for athletes under 18.");
      return;
    }

    setSaving(true);

    try {
      const athlete = await new LocalAthleteRepository().create(
        {
          address: {
            district: fieldValue(form, "district"),
            line1: fieldValue(form, "address-line1"),
            line2: null,
            postalCode: fieldValue(form, "postal-code"),
            state: fieldValue(form, "state"),
            villageOrCity: fieldValue(form, "city"),
          },
          ageCategory: fieldValue(form, "age-category"),
          consentStatus: isChecked(form, "privacy-consent") ? "granted" : "pending",
          dateOfBirth: dob,
          discipline: fieldValue(form, "event"),
          emailAddress: nullableFieldValue(form, "email"),
          emergencyContact: contact(form, "emergency"),
          fullName: fieldValue(form, "name"),
          gender: fieldValue(form, "gender") as "female" | "male" | "non-binary",
          guardian,
          heightCm: nullableNumber(height),
          institutionName: fieldValue(form, "academy"),
          mobileNumber: fieldValue(form, "mobile"),
          sport: fieldValue(form, "sport"),
          weightKg: nullableNumber(weight),
        },
        crypto.randomUUID(),
      );

      setSelectedAthleteId(athlete.id);
      toast.success("Athlete profile saved securely on this device.");
      navigate({ to: "/select-athlete" });
    } catch (error) {
      console.error(error);
      toast.error("Unable to save this profile. Check the required details and consent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Register Athlete" subtitle="Athlete Profile" backTo="/dashboard">
      <form onSubmit={handleSubmit}>
        <Section title="Identity">
          <div className="mt-4 flex items-center gap-4">
            <span className="bg-gradient-primary grid size-20 shrink-0 place-items-center rounded-3xl text-primary-foreground">
              <Camera className="size-7" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Profile Photo</p>
              <button
                type="button"
                className="mt-2 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-primary"
              >
                Upload Photo
              </button>
            </div>
          </div>

          <Field id="name" label="Athlete Name">
            <input id="name" required className={fieldClass} />
          </Field>

          <Field id="athlete-id" label="Athlete ID (auto-generated)">
            <input
              id="athlete-id"
              readOnly
              value="Generated securely when saved offline"
              className={`${fieldClass} text-muted-foreground`}
            />
          </Field>

          <Field id="gender" label="Gender">
            <select id="gender" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Select gender
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary / self-described</option>
            </select>
          </Field>

          <Field id="dob" label="Date of Birth">
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className={fieldClass}
            />
          </Field>

          <Field id="age" label="Age (auto calculated)">
            <input
              id="age"
              readOnly
              value={`${age} years`}
              className={`${fieldClass} text-muted-foreground`}
            />
          </Field>
        </Section>

        <Section title="Guardian Details">
          <Field id="guardian-name" label="Parent / Guardian Name">
            <input id="guardian-name" className={fieldClass} />
          </Field>
          <Field id="guardian-relationship" label="Relationship">
            <input
              id="guardian-relationship"
              placeholder="Parent, guardian or caregiver"
              className={fieldClass}
            />
          </Field>
          <Field id="guardian-mobile" label="Mobile Number">
            <input id="guardian-mobile" type="tel" className={fieldClass} />
          </Field>
          <Field id="guardian-email" label="Email (optional)">
            <input id="guardian-email" type="email" className={fieldClass} />
          </Field>
        </Section>

        <Section title="Sport Details">
          <Field id="sport" label="Sport">
            <select id="sport" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Select sport
              </option>
              <option value="Athletics">Athletics</option>
              <option value="Football">Football</option>
              <option value="Kabaddi">Kabaddi</option>
              <option value="Basketball">Basketball</option>
              <option value="Hockey">Hockey</option>
              <option value="Wrestling">Wrestling</option>
            </select>
          </Field>
          <Field id="event" label="Event / Discipline">
            <input id="event" required className={fieldClass} />
          </Field>
          <Field id="age-category" label="Age Category">
            <select id="age-category" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Select age category
              </option>
              <option value="Under 14">Under 14</option>
              <option value="Under 17">Under 17</option>
              <option value="Under 19">Under 19</option>
              <option value="Open">Open</option>
            </select>
          </Field>
          <Field id="state" label="State">
            <input id="state" required className={fieldClass} />
          </Field>
          <Field id="district" label="District">
            <input id="district" required className={fieldClass} />
          </Field>
          <Field id="academy" label="Academy / School">
            <input id="academy" required className={fieldClass} />
          </Field>
          <Field id="coach" label="Coach Name">
            <input id="coach" className={fieldClass} />
          </Field>
        </Section>

        <Section title="Physical Profile">
          <Field id="height" label="Height (cm)">
            <input
              id="height"
              type="number"
              min="1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field id="weight" label="Weight (kg)">
            <input
              id="weight"
              type="number"
              min="1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field id="bmi" label="BMI (auto calculated)">
            <input
              id="bmi"
              readOnly
              value={bmi}
              className={`${fieldClass} text-muted-foreground`}
            />
          </Field>
          <Field id="hand" label="Dominant Hand">
            <select id="hand" defaultValue="Right" className={fieldClass}>
              <option>Right</option>
              <option>Left</option>
              <option>Ambidextrous</option>
            </select>
          </Field>
          <Field id="leg" label="Dominant Leg">
            <select id="leg" defaultValue="Right" className={fieldClass}>
              <option>Right</option>
              <option>Left</option>
            </select>
          </Field>
        </Section>

        <Section title="Contact">
          <Field id="mobile" label="Mobile Number">
            <input id="mobile" type="tel" required className={fieldClass} />
          </Field>
          <Field id="email" label="Email (optional)">
            <input
              id="email"
              type="email"
              placeholder="athlete@example.in"
              className={fieldClass}
            />
          </Field>
          <Field id="emergency-name" label="Emergency Contact Name">
            <input id="emergency-name" required className={fieldClass} />
          </Field>
          <Field id="emergency-relationship" label="Emergency Contact Relationship">
            <input id="emergency-relationship" required className={fieldClass} />
          </Field>
          <Field id="emergency-mobile" label="Emergency Contact Mobile">
            <input id="emergency-mobile" type="tel" required className={fieldClass} />
          </Field>
          <Field id="emergency-email" label="Emergency Contact Email (optional)">
            <input id="emergency-email" type="email" className={fieldClass} />
          </Field>
          <Field id="address-line1" label="Address">
            <input id="address-line1" required className={fieldClass} />
          </Field>
          <Field id="city" label="Village / City">
            <input id="city" required className={fieldClass} />
          </Field>
          <Field id="postal-code" label="Postal Code">
            <input id="postal-code" required className={fieldClass} />
          </Field>
        </Section>

        <Section title="Medical">
          <Field id="blood" label="Blood Group">
            <select id="blood" defaultValue="B+" className={fieldClass}>
              {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field id="medical" label="Medical Conditions">
            <textarea
              id="medical"
              rows={2}
              defaultValue="None reported"
              className={`${fieldClass} h-auto`}
            />
          </Field>
          <Field id="injuries" label="Previous Injuries">
            <textarea
              id="injuries"
              rows={2}
              defaultValue="Left ankle sprain (2024, recovered)"
              className={`${fieldClass} h-auto`}
            />
          </Field>
        </Section>

        <Section title="Consent & Privacy">
          <label className="mt-4 flex items-start gap-3 text-sm text-muted-foreground">
            <input
              id="privacy-consent"
              type="checkbox"
              required
              className="mt-1 size-4 accent-[var(--primary)]"
            />
            <span>
              I confirm that the athlete or their authorized guardian has accepted the assessment
              and privacy consent required for this profile.
            </span>
          </label>
        </Section>

        <button
          type="submit"
          disabled={saving}
          className="bg-gradient-primary mt-5 h-14 w-full rounded-2xl text-base font-semibold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {saving ? "Saving Offline..." : "Save Athlete Profile"}
        </button>
      </form>
    </AppShell>
  );
}

function contact(form: HTMLFormElement, prefix: "emergency" | "guardian") {
  return {
    emailAddress: nullableFieldValue(form, `${prefix}-email`),
    fullName: fieldValue(form, `${prefix}-name`),
    mobileNumber: fieldValue(form, `${prefix}-mobile`),
    relationship: fieldValue(form, `${prefix}-relationship`),
  };
}

function fieldValue(form: HTMLFormElement, id: string) {
  return (
    form
      .querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)
      ?.value.trim() ?? ""
  );
}

function isChecked(form: HTMLFormElement, id: string) {
  return form.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false;
}

function nullableFieldValue(form: HTMLFormElement, id: string) {
  return fieldValue(form, id) || null;
}

function nullableNumber(value: string) {
  return value ? Number(value) : null;
}

function optionalContact(form: HTMLFormElement, prefix: "guardian") {
  const person = contact(form, prefix);
  return person.fullName || person.relationship || person.mobileNumber || person.emailAddress
    ? person
    : null;
}
