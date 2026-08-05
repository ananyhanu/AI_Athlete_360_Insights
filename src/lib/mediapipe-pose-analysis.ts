export type PoseLandmark = {
  presence?: number;
  visibility?: number;
  x: number;
  y: number;
};

export type PoseQualityEvidence = {
  analyzedFrames: number;
  bodyInFrameRate: number;
  detectedFrames: number;
  meanLandmarkVisibility: number;
  model: "mediapipe-pose-landmarker-lite";
  modelVersion: "1";
};

export type PoseMotionEvidence = {
  horizontalDisplacementBodyHeights: number;
  horizontalTravelBodyHeights: number;
  observedDurationSeconds: number;
  verticalDisplacementBodyHeights: number;
  verticalRangeBodyHeights?: number;
  verticalTravelBodyHeights: number;
  wristTravelBodyHeights: number;
  torsoMovementCycles?: number;
};

export type PoseAnalysis =
  | {
      evidence: PoseQualityEvidence;
      motion?: PoseMotionEvidence;
      reason: null;
      status: "analyzed";
    }
  | { evidence: null; reason: string; status: "failed" | "unavailable" };

type PoseRuntimeConfiguration = {
  modelUrl: string;
  wasmRootUrl: string;
};

const requiredLandmarkIndexes = [0, 11, 12, 23, 24, 27, 28] as const;
const minimumDetectedFrameRate = 0.7;
const minimumVisibility = 0.55;
const minimumBodyInFrameRate = 0.6;

export function poseRuntimeConfiguration(
  modelUrl = import.meta.env["VITE_MEDIAPIPE_POSE_MODEL_URL"] ??
    "/models/pose_landmarker_lite.task",
  wasmRootUrl = import.meta.env["VITE_MEDIAPIPE_WASM_URL"] ?? "/mediapipe/wasm",
): PoseRuntimeConfiguration | null {
  return isSafeAssetUrl(modelUrl) && isSafeAssetUrl(wasmRootUrl) ? { modelUrl, wasmRootUrl } : null;
}

export function summarizePoseFrames(
  frames: readonly (readonly PoseLandmark[])[],
): PoseQualityEvidence | null {
  if (!frames.length) return null;

  const detectedFrames = frames.filter((landmarks) => landmarks.length > 0);
  if (!detectedFrames.length) {
    return {
      analyzedFrames: frames.length,
      bodyInFrameRate: 0,
      detectedFrames: 0,
      meanLandmarkVisibility: 0,
      model: "mediapipe-pose-landmarker-lite",
      modelVersion: "1",
    };
  }

  const visibility = detectedFrames.reduce((total, landmarks) => {
    const relevantLandmarks = requiredLandmarkIndexes
      .map((index) => landmarks[index])
      .filter((landmark): landmark is PoseLandmark => landmark !== undefined);
    if (!relevantLandmarks.length) return total;

    return (
      total +
      relevantLandmarks.reduce(
        (sum, landmark) => sum + landmarkVisibility(landmark),
        0,
      ) /
        relevantLandmarks.length
    );
  }, 0);
  const fullyFramed = detectedFrames.filter((landmarks) =>
    requiredLandmarkIndexes.every((index) => {
      const landmark = landmarks[index];
      return landmark && landmark.x >= 0.03 && landmark.x <= 0.97 && landmark.y >= 0.03 && landmark.y <= 0.97;
    }),
  ).length;

  return {
    analyzedFrames: frames.length,
    bodyInFrameRate: round(fullyFramed / frames.length),
    detectedFrames: detectedFrames.length,
    meanLandmarkVisibility: round(visibility / detectedFrames.length),
    model: "mediapipe-pose-landmarker-lite",
    modelVersion: "1",
  };
}

export function poseQualityIsUsable(evidence: PoseQualityEvidence) {
  return (
    evidence.detectedFrames / evidence.analyzedFrames >= minimumDetectedFrameRate &&
    evidence.meanLandmarkVisibility >= minimumVisibility &&
    evidence.bodyInFrameRate >= minimumBodyInFrameRate
  );
}

export function summarizePoseMotion(
  frames: readonly (readonly PoseLandmark[])[],
  timestamps: readonly number[],
): PoseMotionEvidence | null {
  const samples = frames.flatMap((landmarks, index) => {
    const center = midpoint(landmarks[23], landmarks[24]) ?? midpoint(landmarks[11], landmarks[12]);
    const shoulders = midpoint(landmarks[11], landmarks[12]);
    const ankles = midpoint(landmarks[27], landmarks[28]);
    const timestamp = timestamps[index];
    if (
      !center ||
      !shoulders ||
      !ankles ||
      timestamp === undefined ||
      !Number.isFinite(timestamp)
    ) {
      return [];
    }

    const bodyHeight = distance(shoulders, ankles);
    return bodyHeight > 0.05 ? [{ bodyHeight, center, timestamp }] : [];
  });
  if (samples.length < 2) return null;

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  if (!firstSample || !lastSample) return null;
  const bodyHeight = median(samples.map((sample) => sample.bodyHeight));
  const horizontalTravel = samples.slice(1).reduce(
    (total, sample, index) => total + Math.abs(sample.center.x - samples[index]!.center.x),
    0,
  );
  const verticalTravel = samples.slice(1).reduce(
    (total, sample, index) => total + Math.abs(sample.center.y - samples[index]!.center.y),
    0,
  );
  const wristSamples = frames.flatMap((landmarks) => {
    const wrist = midpointOrSingle(landmarks[15], landmarks[16]);
    return wrist ? [wrist] : [];
  });
  const wristTravel = wristSamples.slice(1).reduce(
    (total, wrist, index) => total + distance(wrist, wristSamples[index]!),
    0,
  );
  const torsoAngles = frames.flatMap((landmarks) => {
    const shoulders = midpoint(landmarks[11], landmarks[12]);
    const hips = midpoint(landmarks[23], landmarks[24]);
    const knees = midpointOrSingle(landmarks[25], landmarks[26]);
    return shoulders && hips && knees ? [angleAt(shoulders, hips, knees)] : [];
  });
  const centerYs = samples.map((sample) => sample.center.y);

  return {
    horizontalDisplacementBodyHeights: round(
      Math.abs(lastSample.center.x - firstSample.center.x) / bodyHeight,
    ),
    horizontalTravelBodyHeights: round(horizontalTravel / bodyHeight),
    observedDurationSeconds: round(lastSample.timestamp - firstSample.timestamp),
    verticalDisplacementBodyHeights: round(
      Math.abs(lastSample.center.y - firstSample.center.y) / bodyHeight,
    ),
    verticalRangeBodyHeights: round((Math.max(...centerYs) - Math.min(...centerYs)) / bodyHeight),
    verticalTravelBodyHeights: round(verticalTravel / bodyHeight),
    wristTravelBodyHeights: round(wristTravel / bodyHeight),
    torsoMovementCycles: countMovementCycles(torsoAngles),
  };
}

export async function analyzeVideoPose(
  blob: Blob,
  durationSeconds: number,
): Promise<PoseAnalysis> {
  const configuration = poseRuntimeConfiguration();
  if (!configuration) {
    return { evidence: null, reason: "The configured MediaPipe asset URLs are invalid.", status: "unavailable" };
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return { evidence: null, reason: "The recording must contain at least one second of video.", status: "failed" };
  }

  let objectUrl: string | undefined;
  let landmarker: { close(): void; detectForVideo(video: HTMLVideoElement, timestamp: number): { landmarks: PoseLandmark[][] } } | undefined;
  try {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(configuration.wasmRootUrl);
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { delegate: "GPU", modelAssetPath: configuration.modelUrl },
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      numPoses: 1,
      runningMode: "VIDEO",
    });
    objectUrl = URL.createObjectURL(blob);
    const video = await loadVideo(objectUrl);
    const sampleCount = Math.min(16, Math.max(4, Math.ceil(durationSeconds * 2)));
    const frames: PoseLandmark[][] = [];
    const timestamps: number[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const timestamp = (durationSeconds * index) / Math.max(1, sampleCount - 1);
      await seekVideo(video, timestamp);
      frames.push(landmarker.detectForVideo(video, Math.round(timestamp * 1000)).landmarks[0] ?? []);
      timestamps.push(timestamp);
    }

    const evidence = summarizePoseFrames(frames);
    if (!evidence) throw new Error("No frames were available for pose analysis.");
    const motion = summarizePoseMotion(frames, timestamps);
    return motion
      ? { evidence, motion, reason: null, status: "analyzed" }
      : { evidence, reason: null, status: "analyzed" };
  } catch (error) {
    console.error(error);
    return {
      evidence: null,
      reason: "MediaPipe pose analysis could not complete for this capture.",
      status: "failed",
    };
  } finally {
    landmarker?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function isSafeAssetUrl(value: string) {
  if (value.startsWith("/")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function loadVideo(source: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("The video could not be decoded for pose analysis."));
    video.src = source;
  });
}

function seekVideo(video: HTMLVideoElement, timestamp: number) {
  return new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("A video frame could not be selected for pose analysis."));
    video.currentTime = timestamp;
  });
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function landmarkVisibility(landmark: PoseLandmark) {
  return landmark.visibility ?? landmark.presence ?? 0;
}

function midpoint(left: PoseLandmark | undefined, right: PoseLandmark | undefined) {
  if (!left || !right) return null;
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function midpointOrSingle(left: PoseLandmark | undefined, right: PoseLandmark | undefined) {
  if (left && right) return midpoint(left, right);
  const landmark = left ?? right;
  return landmark ? { x: landmark.x, y: landmark.y } : null;
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function angleAt(
  first: { x: number; y: number },
  vertex: { x: number; y: number },
  last: { x: number; y: number },
) {
  const left = { x: first.x - vertex.x, y: first.y - vertex.y };
  const right = { x: last.x - vertex.x, y: last.y - vertex.y };
  const magnitude = Math.hypot(left.x, left.y) * Math.hypot(right.x, right.y);
  if (magnitude === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (left.x * right.x + left.y * right.y) / magnitude))) * 180) / Math.PI;
}

function countMovementCycles(values: readonly number[]) {
  if (values.length < 3) return 0;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum - minimum < 25) return 0;

  const midpointValue = (minimum + maximum) / 2;
  let crossings = 0;
  let above = values[0]! >= midpointValue;
  for (const value of values.slice(1)) {
    const nextAbove = value >= midpointValue;
    if (nextAbove !== above) crossings += 1;
    above = nextAbove;
  }
  return Math.floor(crossings / 2);
}