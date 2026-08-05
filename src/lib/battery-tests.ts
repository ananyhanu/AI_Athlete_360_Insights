export type BatteryTest = {
  id: string;
  name: string;
  measures: string;
  description: string;
  unit: string;
  measurement: string;
  score: number;
  coachScore: number;
  confidence: number;
  pass: boolean;
  level: "Excellent" | "Good" | "Average" | "Needs Improvement" | "Not scored";
  captureMode: "manual" | "video";
  dataStatus: "provisional";
  scored: boolean;
  manualEntry?: {
    label: string;
    min: number;
    max: number;
    step: number;
  };
  observations: string[];
  recommendations: string[];
};

type ProvisionalTest = Omit<BatteryTest, "dataStatus">;

function provisionalTest(test: ProvisionalTest): BatteryTest {
  return {
    ...test,
    dataStatus: "provisional",
    observations: [
      "This is a provisional assessment record and requires coach validation before acceptance.",
      "AI estimates use observed pose movement and configured test ranges; calibrated protocols remain required for official measurement.",
    ],
    recommendations: [
      "Review the AI estimate against the independently measured result and confirm the performance score before accepting the attempt.",
      "Apply your approved protocol and benchmark standard when assigning the coach score.",
    ],
  };
}

export const batteryTests: BatteryTest[] = [
  provisionalTest({
    id: "height",
    name: "Height",
    measures: "Anthropometric Measurement",
    description:
      "Coach-entered height from a calibrated stadiometer or validated measuring device.",
    unit: "cm",
    measurement: "Coach-entered height required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "manual",
    scored: false,
    manualEntry: { label: "Height in centimetres", min: 80, max: 250, step: 0.1 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "weight",
    name: "Weight",
    measures: "Anthropometric Measurement",
    description: "Coach-entered body weight from a calibrated digital scale.",
    unit: "kg",
    measurement: "Coach-entered weight required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "manual",
    scored: false,
    manualEntry: { label: "Weight in kilograms", min: 15, max: 300, step: 0.1 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "sit-and-reach",
    name: "Sit & Reach",
    measures: "Flexibility",
    description:
      "Prototype video-assisted flexibility workflow with coach confirmation of the furthest reach.",
    unit: "cm",
    measurement: "Coach-verified reach required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "Sit & Reach distance in centimetres", min: 0, max: 100, step: 0.1 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "vertical-jump",
    name: "Standing Vertical Jump",
    measures: "Lower Body Explosive Power",
    description: "Prototype video-capture workflow for a coach-verified jump-height measurement.",
    unit: "cm",
    measurement: "Coach-verified jump height required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "Standing Vertical Jump height in centimetres", min: 5, max: 150, step: 0.1 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "broad-jump",
    name: "Standing Broad Jump",
    measures: "Lower Body Explosive Strength",
    description: "Prototype video-capture workflow for a coach-verified horizontal jump distance.",
    unit: "m",
    measurement: "Coach-verified jump distance required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "Standing Broad Jump distance in metres", min: 0.5, max: 5, step: 0.01 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "medicine-ball-throw",
    name: "Medicine Ball Throw",
    measures: "Upper Body Explosive Strength",
    description: "Prototype video-capture workflow for a coach-verified throw distance.",
    unit: "m",
    measurement: "Coach-verified throw distance required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "Medicine Ball Throw distance in metres", min: 0.5, max: 30, step: 0.01 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "30m-sprint",
    name: "30m Sprint",
    measures: "Speed",
    description: "Prototype video-capture workflow for a coach-verified start-to-finish time.",
    unit: "s",
    measurement: "Coach-verified sprint time required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "30m Sprint time in seconds", min: 3, max: 20, step: 0.01 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "4x10-shuttle-run",
    name: "4x10 Shuttle Run",
    measures: "Agility",
    description:
      "Prototype video-capture workflow for a coach-verified shuttle-run completion time.",
    unit: "s",
    measurement: "Coach-verified shuttle time required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "4x10m Shuttle Run time in seconds", min: 5, max: 60, step: 0.01 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "sit-ups",
    name: "Sit-Ups",
    measures: "Abdominal Strength",
    description:
      "Prototype video-capture workflow for coach-confirmed valid repetitions in 60 seconds.",
    unit: "reps",
    measurement: "Coach-verified repetition count required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "Valid Sit-Ups in 60 seconds", min: 0, max: 150, step: 1 },
    observations: [],
    recommendations: [],
  }),
  provisionalTest({
    id: "endurance-run",
    name: "Endurance Run",
    measures: "Aerobic Endurance",
    description:
      "Prototype video-capture workflow for coach-verified endurance distance or lap completion.",
    unit: "m",
    measurement: "Coach-verified endurance distance required",
    score: 0,
    coachScore: 0,
    confidence: 0,
    pass: false,
    level: "Not scored",
    captureMode: "video",
    scored: false,
    manualEntry: { label: "Endurance Run distance in metres", min: 100, max: 20000, step: 1 },
    observations: [],
    recommendations: [],
  }),
];

export const batteryTestCount = batteryTests.length;

export type AiMeasurementCapability = {
  current: "pose-estimate" | "manual-only";
  futureRequirement: string;
};

/**
 * Makes the boundary explicit: all video tests have a provisional pose estimator today;
 * anthropometric measurements require calibrated devices before an AI result is supportable.
 */
export const aiMeasurementCapabilities: Record<string, AiMeasurementCapability> = {
  height: {
    current: "manual-only",
    futureRequirement: "Calibrated camera reference and stadiometer validation",
  },
  weight: {
    current: "manual-only",
    futureRequirement: "Connected calibrated scale or validated body-mass measurement device",
  },
  "sit-and-reach": {
    current: "pose-estimate",
    futureRequirement: "Reference ruler calibration for official reach distance",
  },
  "vertical-jump": {
    current: "pose-estimate",
    futureRequirement: "Reference-marker calibration and validated take-off/landing model",
  },
  "broad-jump": {
    current: "pose-estimate",
    futureRequirement: "Reference-marker calibration for horizontal distance",
  },
  "medicine-ball-throw": {
    current: "pose-estimate",
    futureRequirement: "Ball tracking and reference-marker calibration",
  },
  "30m-sprint": {
    current: "pose-estimate",
    futureRequirement: "Start/finish-line detection validated against timing gates",
  },
  "4x10-shuttle-run": {
    current: "pose-estimate",
    futureRequirement: "Turn-line detection validated against timing gates",
  },
  "sit-ups": {
    current: "pose-estimate",
    futureRequirement: "Dense frame sampling and validated repetition classifier",
  },
  "endurance-run": {
    current: "pose-estimate",
    futureRequirement: "Lap markers or GPS calibration for official distance",
  },
};

export function getBatteryTest(id: string): BatteryTest {
  return batteryTests.find((test) => test.id === id) ?? (batteryTests[0] as BatteryTest);
}

export function scoredTests() {
  return batteryTests.filter((test) => test.scored);
}

export function provisionalAverageScore() {
  const tests = scoredTests();
  return tests.length
    ? tests.reduce((sum, test) => sum + test.score, 0) / tests.length
    : null;
}

export const assessmentMeta = {
  coachName: "Coach Ramesh Kumar",
  assessmentId: "DEMO-ASMT-001",
  date: "Provisional demo data",
  dataStatus: "Provisional coach-validated assessment - not an official assessment",
};

export const videoInstructions = [
  "Place the phone on a stable surface, 3 metres away.",
  "Ensure the athlete's full body is visible in the frame.",
  "Record in a well-lit area with a plain background.",
  "Only one athlete should be in the frame during the test.",
  "Confirm the measurement with the coach before completing the prototype workflow.",
];

export const manualInstructions = [
  "Use a calibrated measuring device and record the displayed value.",
  "Ask the coach to verify the value before continuing.",
  "This prototype does not yet persist manual measurements as official assessment records.",
];

export function instructionsFor(test: BatteryTest) {
  return test.captureMode === "manual" ? manualInstructions : videoInstructions;
}
