import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Camera, Circle, SwitchCamera, X, Zap, ZapOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getBatteryTest } from "@/lib/battery-tests";
import { VideoPreview } from "@/components/VideoPreview";
import { useSelectedAthlete } from "@/lib/athletes";
import { LocalCaptureRepository } from "@/lib/local-capture-repository";

export const Route = createFileRoute("/battery/$testId/record")({
  head: () => ({
    meta: [
      { title: "Record Video — AI Athlete 360" },
      {
        name: "description",
        content:
          "Camera recording screen with timer, flash and camera switch for the battery test.",
      },
      { property: "og:title", content: "Record Video — AI Athlete 360" },
      {
        property: "og:description",
        content: "Record the athlete's test video before AI analysis.",
      },
    ],
  }),
  component: RecordScreen,
});

function RecordScreen() {
  const { testId } = useParams({ from: "/battery/$testId/record" });
  const test = getBatteryTest(testId);
  const navigate = useNavigate();
  const athlete = useSelectedAthlete();

  const chunks = useRef<Blob[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const secondsRef = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [calibration, setCalibration] = useState({
    framing: false,
    lighting: false,
    reference: false,
  });
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<{ blob: Blob; durationSeconds: number } | null>(null);
  const [front, setFront] = useState(false);
  const [flash, setFlash] = useState(false);
  const [saving, setSaving] = useState(false);

  const calibrationComplete = calibration.framing && calibration.lighting && calibration.reference;

  function attachPreview(element: HTMLVideoElement | null) {
    video.current = element;
    if (!element || !stream.current) return;

    element.srcObject = stream.current;
    void element.play().catch(() => undefined);
  }

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setSeconds((current) => {
        const next = current + 1;
        secondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (recorded) return;

    let active = true;
    void openCamera();
    return () => {
      active = false;
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        stream.current = null;
      }
    };

    async function openCamera() {
      setCameraError(null);
      setCameraReady(false);

      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        setCameraError("This browser does not support camera recording.");
        return;
      }

      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: front ? "user" : "environment" },
            height: { ideal: 1080 },
            width: { ideal: 1920 },
          },
        });

        if (!active) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream.current = nextStream;
        if (video.current) {
          video.current.srcObject = nextStream;
          await video.current.play().catch(() => undefined);
        }
        setCameraReady(true);
      } catch {
        setCameraError("Camera access was unavailable. Allow the camera permission and try again.");
      }
    }
  }, [cameraAttempt, front, recorded]);

  function startRecording() {
    if (!stream.current || !calibrationComplete) return;

    const mimeType = supportedVideoMimeType();
    const nextRecorder = mimeType
      ? new MediaRecorder(stream.current, { mimeType })
      : new MediaRecorder(stream.current);

    chunks.current = [];
    secondsRef.current = 0;
    setSeconds(0);
    nextRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    nextRecorder.onstop = () => {
      const blob = new Blob(chunks.current, { type: nextRecorder.mimeType || "video/webm" });
      setRecorded({ blob, durationSeconds: Math.max(1, secondsRef.current) });
      setRecording(false);
    };
    recorder.current = nextRecorder;
    nextRecorder.start(250);
    setRecording(true);
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") {
      recorder.current.requestData();
      recorder.current.stop();
    }
  }

  function retake() {
    setRecorded(null);
    setSeconds(0);
  }

  async function useVideo() {
    if (!recorded) return;
    setSaving(true);

    try {
      const capture = await new LocalCaptureRepository().save({
        athleteId: athlete.id,
        blob: recorded.blob,
        durationSeconds: recorded.durationSeconds,
        mimeType: recorded.blob.type || "video/webm",
        source: "camera",
        testId: test.id,
      });
      navigate({
        to: "/battery/$testId/processing",
        params: { testId: test.id },
        search: { captureId: capture.id, source: "record" },
      });
    } catch (error) {
      console.error(error);
      toast.error("The recorded video could not be saved securely on this device.");
    } finally {
      setSaving(false);
    }
  }

  if (recorded) {
    return (
      <VideoPreview
        title={`${test.name} — Recorded Clip`}
        meta={`${fmt(recorded.durationSeconds)} · ${front ? "Front" : "Rear"} camera`}
        primaryLabel={saving ? "Saving Securely..." : "Use Video"}
        secondaryLabel="Retake"
        video={recorded.blob}
        onSecondary={retake}
        onPrimary={useVideo}
        onCancel={() => navigate({ to: "/battery/$testId", params: { testId: test.id } })}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-foreground text-background">
      <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-primary/15 blur-3xl" />
      <header className="flex items-center gap-3 px-5 pt-6">
        <button
          onClick={() => navigate({ to: "/battery/$testId", params: { testId: test.id } })}
          aria-label="Cancel"
          className="grid size-10 place-items-center rounded-full bg-background/15"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{test.name}</p>
          <p className="truncate text-xs text-background/70">Video Recording</p>
        </div>
        <span
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-display text-sm font-bold tabular-nums ${
            recording ? "bg-destructive text-destructive-foreground" : "bg-background/15"
          }`}
        >
          <Circle
            className={`size-2.5 ${recording ? "fill-current animate-pulse" : "fill-current opacity-50"}`}
          />
          {fmt(seconds)}
        </span>
      </header>

      <div className="relative mx-5 mt-5 flex-1 overflow-hidden rounded-3xl border border-primary/35 bg-background/5 shadow-elevated">
        {cameraReady ? (
          <video
            ref={attachPreview}
            autoPlay
            muted
            playsInline
            className="h-full min-h-[380px] w-full object-cover"
          />
        ) : (
          <div className="grid h-full min-h-[380px] place-items-center px-6 text-center">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-background/10">
                <Camera className="size-8" />
              </span>
              <p className="mt-4 font-display text-lg font-bold">
                {cameraError ? "Camera Unavailable" : "Starting Camera"}
              </p>
              <p className="mt-1 text-sm text-background/70">
                {cameraError ?? "Requesting a rear-camera preview for calibration."}
              </p>
              {cameraError ? (
                <button
                  onClick={() => setCameraAttempt((attempt) => attempt + 1)}
                  className="mt-4 text-sm font-semibold text-primary-foreground underline"
                >
                  Retry Camera
                </button>
              ) : null}
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-primary/55" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-primary/70 shadow-[0_0_18px_var(--primary)] animate-pulse" />
      </div>

      <section className="mx-5 mt-4 rounded-2xl border border-background/10 bg-background/10 p-4 backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-background/75">
          Calibration Check
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <CalibrationCheck
            checked={calibration.framing}
            label="Athlete is fully visible in the frame"
            onChange={(checked) => setCalibration((current) => ({ ...current, framing: checked }))}
          />
          <CalibrationCheck
            checked={calibration.lighting}
            label="Lighting and background are clear"
            onChange={(checked) => setCalibration((current) => ({ ...current, lighting: checked }))}
          />
          <CalibrationCheck
            checked={calibration.reference}
            label="Camera position and reference zone are aligned"
            onChange={(checked) =>
              setCalibration((current) => ({ ...current, reference: checked }))
            }
          />
        </div>
      </section>

      <div className="px-5 pb-10 pt-6">
        <div className="grid grid-cols-3 items-center">
          <button
            onClick={() => setFlash((f) => !f)}
            disabled
            title="Torch control depends on device hardware and is not available in this browser capture mode."
            className="flex flex-col items-center gap-1 text-xs font-semibold text-background/80"
          >
            <span className="grid size-12 place-items-center rounded-full bg-background/15">
              {flash ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
            </span>
            Flash {flash ? "On" : "Off"}
          </button>

          <button
            onClick={() => (recording ? stopRecording() : startRecording())}
            aria-label={recording ? "Stop recording" : "Record"}
            disabled={!cameraReady || (!recording && !calibrationComplete)}
            className="mx-auto grid size-20 place-items-center rounded-full border-4 border-background/70 transition-transform active:scale-95 disabled:opacity-40"
          >
            <span
              className={
                recording
                  ? "size-7 rounded-md bg-destructive"
                  : "size-14 rounded-full bg-destructive"
              }
            />
          </button>

          <button
            onClick={() => setFront((f) => !f)}
            disabled={recording}
            className="flex flex-col items-center gap-1 text-xs font-semibold text-background/80"
          >
            <span className="grid size-12 place-items-center rounded-full bg-background/15">
              <SwitchCamera className="size-5" />
            </span>
            Switch
          </button>
        </div>
        <p className="mt-5 text-center text-xs text-background/60">
          {recording
            ? "Tap the button again to stop."
            : calibrationComplete
              ? "Tap the red button to start recording."
              : "Complete the calibration check before recording."}
        </p>
      </div>
    </div>
  );
}

function fmt(total: number) {
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function CalibrationCheck({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-background/90">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--primary)]"
      />
      <span>{label}</span>
    </label>
  );
}

function supportedVideoMimeType() {
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
    (mimeType) => MediaRecorder.isTypeSupported(mimeType),
  );
}
