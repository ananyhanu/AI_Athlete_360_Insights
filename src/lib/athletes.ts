import { useEffect, useState } from "react";
import type { AthleteRecord } from "./athlete-domain";
import { ApiClient } from "./api-client";
import { assessmentApiBaseUrl } from "./assessment-sync-runtime";
import { HttpAthleteRepository } from "./athlete-repository";
import { getServerAccessToken } from "./prototype-session";

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
  profilePhotoDataUrl?: string | null;
  bloodGroup: string;
  medical: string;
  injuries: string;
  dominantHand: string;
  dominantLeg: string;
  lastAssessment: string;
};

const STORAGE_KEY = "aa360.selectedAthleteId";
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
  return { ...loadingAthlete, id: id ?? "" };
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
    const repository = getRemoteAthleteRepository();
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

  return registeredAthletes;
}

export function useSelectedAthlete(): Athlete {
  const [athlete, setAthlete] = useState<Athlete>(() => ({
    ...loadingAthlete,
    id: getSelectedAthleteId() ?? "",
  }));

  useEffect(() => {
    const id = getSelectedAthleteId();
    if (!id) {
      setAthlete({ ...loadingAthlete, id: "" });
      return;
    }
    const repository = getRemoteAthleteRepository();
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

function getRemoteAthleteRepository() {
  const baseUrl = assessmentApiBaseUrl();
  if (typeof window === "undefined" || !baseUrl || !getServerAccessToken()) return null;
  return new HttpAthleteRepository(new ApiClient({ baseUrl, getAccessToken: getServerAccessToken }));
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
    profilePhotoDataUrl: record.profilePhotoDataUrl ?? null,
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
