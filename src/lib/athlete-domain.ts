import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isIsoDate);

export const athleteGenderSchema = z.enum([
  "female",
  "male",
  "non-binary",
  "self-describe",
  "prefer-not-to-say",
]);

export const athleteSyncStateSchema = z.enum(["synced", "pending", "conflict", "failed"]);

export const guardianSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(60),
  mobileNumber: z.string().trim().min(7).max(20),
  emailAddress: z.string().trim().email().nullable(),
});

export const athleteAddressSchema = z.object({
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).nullable(),
  villageOrCity: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(3).max(12),
});

export const athleteDraftSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  dateOfBirth: isoDateSchema,
  gender: athleteGenderSchema,
  mobileNumber: z.string().trim().min(7).max(20),
  emailAddress: z.string().trim().email().nullable(),
  guardian: guardianSchema.nullable(),
  emergencyContact: guardianSchema.nullable(),
  address: athleteAddressSchema,
  institutionName: z.string().trim().min(1).max(160),
  profilePhotoDataUrl: z
    .string()
    .regex(
      /^data:image\/(jpeg|png|webp);base64,/,
      "Profile photo must be a JPEG, PNG, or WebP image.",
    )
    .max(3_000_000)
    .nullable()
    .optional(),
  sport: z.string().trim().min(1).max(80),
  discipline: z.string().trim().min(1).max(80),
  ageCategory: z.string().trim().min(1).max(80),
  heightCm: z.number().positive().max(300).nullable(),
  weightKg: z.number().positive().max(500).nullable(),
  consentStatus: z.enum(["pending", "granted", "withdrawn"]),
});

export const athleteRecordSchema = athleteDraftSchema.extend({
  id: z.string().uuid(),
  athleteId: z.string().regex(/^ATH-\d{4}-[A-Z0-9-]{4,64}$/),
  version: z.number().int().positive(),
  syncState: athleteSyncStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AthleteDraft = z.infer<typeof athleteDraftSchema>;
export type AthleteRecord = z.infer<typeof athleteRecordSchema>;
export type AthleteSyncState = z.infer<typeof athleteSyncStateSchema>;

function isIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
