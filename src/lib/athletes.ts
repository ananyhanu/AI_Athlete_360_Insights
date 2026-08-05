import { useEffect, useMemo, useState } from "react";
import type { AthleteRecord } from "./athlete-domain";
import { LocalAthleteRepository } from "./local-athlete-repository";

export type Athlete = {
  id: string;
  name: string;
  age: number;
  dob: string;
  gender: string;
  sport: string;
  event: string;
  athleteId: string;
  state: string;
  district: string;
  academy: string;
  coach: string;
  heightCm: number;
  weightKg: number;
  bmi: number;
  mobile: string;
  email: string;
  bloodGroup: string;
  medical: string;
  injuries: string;
  dominantHand: string;
  dominantLeg: string;
  lastAssessment: string;
};

export const athletes: Athlete[] = [
  {
    id: "arjun-sharma",
    name: "Arjun Sharma",
    age: 17,
    dob: "12 March 2009",
    gender: "Male",
    sport: "Athletics",
    event: "100m Sprint",
    athleteId: "ATH-2026-0184",
    state: "Maharashtra",
    district: "Pune",
    academy: "Shivaji Sports Academy",
    coach: "Coach Ramesh Kumar",
    heightCm: 172,
    weightKg: 61,
    bmi: 20.6,
    mobile: "+91 98200 41827",
    email: "arjun.sharma@example.in",
    bloodGroup: "B+",
    medical: "None reported",
    injuries: "Left ankle sprain (2024, recovered)",
    dominantHand: "Right",
    dominantLeg: "Right",
    lastAssessment: "18 July 2026",
  },
  {
    id: "rohit-kumar",
    name: "Rohit Kumar",
    age: 19,
    dob: "02 January 2007",
    gender: "Male",
    sport: "Football",
    event: "Midfielder",
    athleteId: "ATH-2026-0192",
    state: "Haryana",
    district: "Rohtak",
    academy: "Govt. Model School, Rohtak",
    coach: "Coach Ramesh Kumar",
    heightCm: 178,
    weightKg: 70,
    bmi: 22.1,
    mobile: "+91 98110 55321",
    email: "rohit.k@example.in",
    bloodGroup: "O+",
    medical: "Mild asthma",
    injuries: "None",
    dominantHand: "Right",
    dominantLeg: "Left",
    lastAssessment: "29 July 2026",
  },
  {
    id: "priya-singh",
    name: "Priya Singh",
    age: 16,
    dob: "22 September 2009",
    gender: "Female",
    sport: "Kabaddi",
    event: "Raider",
    athleteId: "ATH-2026-0207",
    state: "Uttar Pradesh",
    district: "Varanasi",
    academy: "SAI Training Centre, Varanasi",
    coach: "Coach Ramesh Kumar",
    heightCm: 163,
    weightKg: 54,
    bmi: 20.3,
    mobile: "+91 90123 77410",
    email: "",
    bloodGroup: "A+",
    medical: "None reported",
    injuries: "Right shoulder strain (2025, recovered)",
    dominantHand: "Right",
    dominantLeg: "Right",
    lastAssessment: "01 August 2026",
  },
  {
    id: "aman-verma",
    name: "Aman Verma",
    age: 18,
    dob: "08 May 2008",
    gender: "Male",
    sport: "Basketball",
    event: "Point Guard",
    athleteId: "ATH-2026-0215",
    state: "Karnataka",
    district: "Bengaluru Urban",
    academy: "Jain Sports Academy",
    coach: "Coach Ramesh Kumar",
    heightCm: 184,
    weightKg: 76,
    bmi: 22.4,
    mobile: "+91 99450 12876",
    email: "aman.verma@example.in",
    bloodGroup: "AB+",
    medical: "None reported",
    injuries: "None",
    dominantHand: "Left",
    dominantLeg: "Left",
    lastAssessment: "31 July 2026",
  },
];

const STORAGE_KEY = "aa360.selectedAthleteId";
let localAthleteRepository: LocalAthleteRepository | undefined;
const loadingAthlete: Athlete = {
  academy: "Loading",
  age: 0,
  athleteId: "Loading",
  bloodGroup: "Loading",
  bmi: 0,
  coach: "Loading",
  district: "Loading",
  dob: "Loading",
  dominantHand: "Loading",
  dominantLeg: "Loading",
  email: "",
  event: "Loading",
  gender: "Loading",
  heightCm: 0,
  id: "",
  injuries: "Loading",
  lastAssessment: "Loading",
  medical: "Loading",
  mobile: "",
  name: "Loading athlete",
  sport: "Loading",
  state: "Loading",
  weightKg: 0,
};

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function getAthlete(id: string | null): Athlete {
  return athletes.find((a) => a.id === id) ?? (athletes[0] as Athlete);
}

export function setSelectedAthleteId(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
}

export function getSelectedAthleteId() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
}

export function useAthletes() {
  const [registeredAthletes, setRegisteredAthletes] = useState<Athlete[]>([]);

  useEffect(() => {
    const repository = getLocalAthleteRepository();
    if (!repository) return;

    let active = true;
    repository
      .list()
      .then((records) => {
        if (active) setRegisteredAthletes(records.map(toDisplayAthlete));
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => [...registeredAthletes, ...athletes], [registeredAthletes]);
}

export function useSelectedAthlete(): Athlete {
  const [athlete, setAthlete] = useState<Athlete>(() => {
    const id = getSelectedAthleteId();
    return athletes.find((candidate) => candidate.id === id) ?? { ...loadingAthlete, id: id ?? "" };
  });

  useEffect(() => {
    const id = getSelectedAthleteId();
    const demoAthlete = athletes.find((candidate) => candidate.id === id);

    if (demoAthlete) {
      setAthlete(demoAthlete);
      return;
    }

    const repository = getLocalAthleteRepository();
    if (!id) {
      setAthlete(getAthlete(null));
      return;
    }

    if (!repository) return;

    let active = true;
    repository
      .getById(id)
      .then((record) => {
        if (active && record) setAthlete(toDisplayAthlete(record));
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, []);

  return athlete;
}

function getLocalAthleteRepository() {
  if (typeof window === "undefined") return null;
  localAthleteRepository ??= new LocalAthleteRepository();
  return localAthleteRepository;
}

function toDisplayAthlete(record: AthleteRecord): Athlete {
  const heightMetres = record.heightCm ? record.heightCm / 100 : 0;
  const bmi = heightMetres && record.weightKg ? record.weightKg / heightMetres ** 2 : 0;

  return {
    academy: record.institutionName,
    age: ageOnDate(record.dateOfBirth),
    athleteId: record.athleteId,
    bloodGroup: "Not recorded",
    bmi: Number(bmi.toFixed(1)),
    coach: "Unassigned",
    district: record.address.district,
    dominantHand: "Not recorded",
    dominantLeg: "Not recorded",
    dob: record.dateOfBirth,
    email: record.emailAddress ?? "",
    event: record.discipline,
    gender: record.gender,
    heightCm: record.heightCm ?? 0,
    id: record.id,
    injuries: "Not recorded",
    lastAssessment: "Not assessed",
    medical: "Not recorded",
    mobile: record.mobileNumber,
    name: record.fullName,
    sport: record.sport,
    state: record.address.state,
    weightKg: record.weightKg ?? 0,
  };
}

function ageOnDate(dateOfBirth: string) {
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const today = new Date();
  const birthdayThisYear = new Date(
    today.getFullYear(),
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  );

  return today.getFullYear() - birthDate.getUTCFullYear() - Number(today < birthdayThisYear);
}
