import { describe, expect, it } from "vitest";
import {
  poseQualityIsUsable,
  poseRuntimeConfiguration,
  summarizePoseMotion,
  summarizePoseFrames,
  type PoseLandmark,
} from "./mediapipe-pose-analysis";

const visiblePose = Array.from({ length: 33 }, () => ({ visibility: 0.9, x: 0.5, y: 0.5 }));

describe("MediaPipe pose quality", () => {
  it("derives usable visibility and framing evidence from detected landmarks", () => {
    const evidence = summarizePoseFrames([visiblePose, visiblePose]);

    expect(evidence).toMatchObject({
      analyzedFrames: 2,
      bodyInFrameRate: 1,
      detectedFrames: 2,
      meanLandmarkVisibility: 0.9,
    });
    expect(evidence && poseQualityIsUsable(evidence)).toBe(true);
  });

  it("marks missing or poorly framed landmarks as unsuitable for measurement", () => {
    const offFramePose: PoseLandmark[] = visiblePose.map((landmark, index) =>
      index === 0 ? { ...landmark, x: 1 } : landmark,
    );
    const evidence = summarizePoseFrames([[], offFramePose]);

    expect(evidence).toMatchObject({
      analyzedFrames: 2,
      bodyInFrameRate: 0,
      detectedFrames: 1,
    });
    expect(evidence && poseQualityIsUsable(evidence)).toBe(false);
  });

  it("summarizes observed pose trajectory without retaining individual landmarks", () => {
    const start = motionPose(0.2, 0.55);
    const finish = motionPose(0.8, 0.45);

    expect(summarizePoseMotion([start, finish], [1, 5])).toEqual({
      horizontalDisplacementBodyHeights: 1,
      horizontalTravelBodyHeights: 1,
      observedDurationSeconds: 4,
      verticalDisplacementBodyHeights: 0.167,
      verticalRangeBodyHeights: 0.167,
      verticalTravelBodyHeights: 0.167,
      wristTravelBodyHeights: 0,
      torsoMovementCycles: 0,
    });
  });

  it("uses one visible wrist and knee when the paired landmarks are occluded", () => {
    const start = motionPose(0.2, 0.55);
    const finish = motionPose(0.8, 0.45);
    start[16] = undefined as unknown as PoseLandmark;
    start[26] = undefined as unknown as PoseLandmark;
    finish[16] = undefined as unknown as PoseLandmark;
    finish[26] = undefined as unknown as PoseLandmark;

    const motion = summarizePoseMotion([start, finish], [1, 5]);

    expect(motion).toMatchObject({
      observedDurationSeconds: 4,
      wristTravelBodyHeights: 0,
    });
  });

  it("uses same-origin assets by default and rejects insecure remote URLs", () => {
    expect(poseRuntimeConfiguration("/models/pose_landmarker_lite.task", "/mediapipe/wasm")).toEqual({
      modelUrl: "/models/pose_landmarker_lite.task",
      wasmRootUrl: "/mediapipe/wasm",
    });
    expect(poseRuntimeConfiguration("http://model.example.in/pose.task", "/mediapipe/wasm")).toBeNull();
  });
});

function motionPose(x: number, hipY: number): PoseLandmark[] {
  return visiblePose.map((landmark, index) => {
    if (index === 11 || index === 12) return { ...landmark, x, y: hipY - 0.2 };
    if (index === 23 || index === 24) return { ...landmark, x, y: hipY };
    if (index === 27 || index === 28) return { ...landmark, x, y: hipY + 0.4 };
    return landmark;
  });
}