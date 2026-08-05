import type { Athlete } from "./athletes";
import { assessmentMeta, batteryTests, provisionalAverageScore } from "./battery-tests";
import type { AssessmentSummary } from "./assessment-summary";

export type ReportPdf = { url: string; fileName: string; sizeKb: number };

const INK: [number, number, number] = [24, 24, 24];
const ORANGE: [number, number, number] = [230, 98, 18];
const LIGHT: [number, number, number] = [248, 245, 241];
const GREY: [number, number, number] = [105, 105, 102];

/** Generates a clearly labelled prototype report in the browser. */
export async function generateReportPdf(
  athlete: Athlete,
  summary?: AssessmentSummary,
): Promise<ReportPdf> {
  // Keep jsPDF out of the initial application bundle; it is needed only after the coach requests a report.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const logo = await loadReportLogo();

  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 76, "F");
  if (logo) {
    doc.addImage(logo, "PNG", M, 12, 36, 52, undefined, "FAST");
  } else {
    doc.setFillColor(...ORANGE);
    doc.roundedRect(M, 21, 34, 34, 5, 5, "F");
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("AI ATHLETE 360", M + 48, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Athlete Performance Assessment - Provisional", M + 48, 48);
  doc.text("Coach-reviewed data required - not an official assessment", M + 48, 60);

  let y = 96;
  doc.setTextColor(30, 35, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Provisional Assessment Report", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(`Assessment ID: ${assessmentMeta.assessmentId}`, W - M, y, { align: "right" });

  y += 18;
  y = section(doc, "Athlete Details", y, M, W);
  y = compactRows(
    doc,
    [
      ["Name", athlete.name],
      ["Athlete ID", athlete.athleteId],
      ["Age / Gender", `${athlete.age} yrs / ${athlete.gender}`],
      ["Sport / Event", `${athlete.sport} / ${athlete.event}`],
      ["State / District", `${athlete.state} / ${athlete.district}`],
      ["Height / Weight", `${athlete.heightCm} cm / ${athlete.weightKg} kg`],
      ["BMI", `${athlete.bmi} (Normal range)`],
    ],
    y,
    M,
    W,
  );

  y = section(doc, "Coach Details", y + 6, M, W);
  y = compactRows(
    doc,
    [
      ["Coach Name", assessmentMeta.coachName],
      ["Academy", athlete.academy],
      ["Coach ID", "CCH-2026-0042"],
    ],
    y,
    M,
    W,
  );

  const capturedRows = reportRows(summary);
  if (capturedRows.length > 0) {
    y = section(doc, "Captured Test Results", y + 6, M, W);
    doc.setFillColor(...LIGHT);
    doc.rect(M, y - 10, W - M * 2, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 35, 45);
    doc.text("Test", M + 6, y);
    doc.text("Measurement", M + 185, y);
    doc.text("Score", M + 330, y);
    doc.text("Status", M + 396, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    for (const row of capturedRows) {
      doc.text(row.name, M + 6, y);
      doc.text(row.measurement, M + 185, y);
      doc.text(row.score, M + 330, y);
      doc.text(row.rating, M + 396, y);
      y += 13;
    }
  }

  const overall = summary?.averageScore?.toFixed(1) ?? provisionalAverageScore()?.toFixed(1) ?? "N/A";

  y += 5;
  doc.setFillColor(...INK);
  doc.roundedRect(M, y, W - M * 2, 38, 5, 5, "F");
  doc.setFillColor(...ORANGE);
  doc.roundedRect(M, y, 5, 38, 5, 5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AVERAGE CAPTURED SCORE", M + 12, y + 15);
  doc.setFontSize(17);
  doc.text(overall, M + 12, y + 31);
  doc.setFontSize(8.5);
  doc.text(`${capturedRows.length} captured test${capturedRows.length === 1 ? "" : "s"}`, W - M - 12, y + 15, { align: "right" });
  doc.text("Coach validation required", W - M - 12, y + 30, { align: "right" });
  y += 49;

  doc.setTextColor(30, 35, 45);
  y = section(doc, "Assessment Notes", y, M, W);
  y = bullets(
    doc,
    [
      "Measurements and scores are provisional; AI estimates and unaccepted results require coach confirmation.",
      "Pose-derived distance estimates require calibrated reference markers before official use.",
    ],
    y,
    M,
    W,
  );

  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.7);
  doc.setFontSize(7.5);
  doc.text(
    "Provisional report only. Not an official assessment, verified report, or clinical record.",
    W / 2,
    doc.internal.pageSize.getHeight() - 18,
    { align: "center" },
  );

  const blob = doc.output("blob");
  return {
    url: URL.createObjectURL(blob),
    fileName: `AI-Athlete-360-${athlete.athleteId}.pdf`,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
  };
}

export function reportRows(summary?: AssessmentSummary) {
  return (
    summary?.tests
      .flatMap(({ attempt, state, test }) => {
        if (!attempt?.measurement || state === "needs-retest") return [];

        return [
          {
            measurement: `${attempt.measurement.value} ${attempt.measurement.unit}`,
            name: test.name,
            rating: formatAttemptState(state),
            score:
              attempt.evaluation?.score === null || attempt.evaluation?.score === undefined
                ? "N/A"
                : String(attempt.evaluation.score),
          },
        ];
      }) ?? []
  );
}

function formatAttemptState(
  state: "accepted" | "awaiting-coach-review" | "needs-retest" | "not-started",
) {
  return state === "accepted"
    ? "Accepted"
    : state === "awaiting-coach-review"
      ? "Awaiting review"
      : state === "needs-retest"
        ? "Retake required"
        : "Not started";
}

type Doc = Awaited<ReturnType<typeof importDoc>>;
async function importDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF();
}

function section(doc: Doc, title: string, y: number, M: number, W: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...ORANGE);
  doc.text(title.toUpperCase(), M, y);
  doc.setDrawColor(210, 220, 235);
  doc.setLineWidth(0.7);
  doc.line(M, y + 5, W - M, y + 5);
  doc.setTextColor(...INK);
  return y + 22;
}

function compactRows(doc: Doc, data: string[][], y: number, M: number, W: number) {
  doc.setFontSize(8);
  for (const [k, v] of data) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 120, 135);
    doc.text(String(k), M + 4, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(String(v), W - M - 4, y, { align: "right" });
    y += 11;
  }
  return y;
}

async function loadReportLogo() {
  try {
    // Convert the local asset to a data URL because jsPDF embeds image data rather than a browser URL.
    const response = await fetch("/images/ai-athlete-logo.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Unable to include the brand logo in the PDF report.", error);
    return null;
  }
}

function bullets(doc: Doc, items: string[], y: number, M: number, W: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(45, 52, 64);
  for (const item of items) {
    const lines = doc.splitTextToSize(`•  ${item}`, W - M * 2 - 8) as string[];
    doc.text(lines, M + 4, y);
    y += lines.length * 10 + 2;
  }
  return y;
}
