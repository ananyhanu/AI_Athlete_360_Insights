import { CheckCircle2, ExternalLink, Loader2, Share2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Athlete } from "@/lib/athletes";
import type { AssessmentSummary } from "@/lib/assessment-summary";
import { generateReportPdf, type ReportPdf } from "@/lib/report-pdf";

/** UI-only PDF generation flow: generate -> "Download Complete" -> View / Share. */
export function useReportDownload() {
  // Keep generation state separate from the completed PDF so controls can prevent duplicate work.
  const [generating, setGenerating] = useState(false);
  const [pdf, setPdf] = useState<ReportPdf | null>(null);

  async function download(athlete: Athlete, summary?: AssessmentSummary) {
    // A second click while jsPDF is loading would otherwise create duplicate blob URLs and downloads.
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateReportPdf(athlete, summary);
      // Use an ephemeral anchor so the browser handles the blob download without a server round trip.
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.fileName;
      a.click();
      setPdf(result);
    } catch {
      toast.error("Could not generate the provisional report.");
    } finally {
      setGenerating(false);
    }
  }

  return { generating, pdf, download, close: () => setPdf(null) };
}

export function DownloadCompleteSheet({
  pdf,
  onClose,
  onShare,
}: {
  pdf: ReportPdf | null;
  onClose: () => void;
  onShare: () => void;
}) {
  // The sheet stays unmounted until a PDF exists, avoiding an empty modal in the document tree.
  if (!pdf) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/40" />
      <div className="relative w-full max-w-2xl rounded-t-3xl bg-card p-6 pb-8 shadow-card">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground"
        >
          <X className="size-4" />
        </button>
        <span className="grid size-14 place-items-center rounded-full bg-success/12 text-success">
          <CheckCircle2 className="size-8" />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold">Download Complete</h2>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {pdf.fileName} · {pdf.sizeKb} KB
        </p>

        <div className="mt-5 space-y-3">
          <a
            href={pdf.url}
            target="_blank"
            rel="noreferrer"
            className="bg-gradient-primary flex h-14 items-center justify-center gap-2 rounded-2xl text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <ExternalLink className="size-5" />
            View PDF
          </a>
          <button
            onClick={onShare}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-base font-semibold text-primary transition-transform active:scale-[0.98]"
          >
            <Share2 className="size-5" />
            Share PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function GeneratingLabel() {
  // Shared compact loading content for report actions that are waiting on the lazy jsPDF import.
  return (
    <>
      <Loader2 className="size-5 animate-spin" />
      Generating PDF…
    </>
  );
}
