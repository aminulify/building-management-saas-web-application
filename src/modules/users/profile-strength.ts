/** "Profile Strength: 85%": the share of these items the owner has filled in. Pure, so it is easy to test. */
export interface StrengthInput {
  avatar: boolean;
  fullName: boolean;
  phone: boolean;
  email: boolean;
  occupation: boolean;
  dateOfBirth: boolean;
  nid: boolean;
  division: boolean;
  district: boolean;
  upazila: boolean;
  union: boolean;
  street: boolean;
  postOffice: boolean;
  nidFront: boolean;
  nidBack: boolean;
}

export const STRENGTH_KEYS = ["avatar", "fullName", "phone", "email", "occupation", "dateOfBirth", "nid", "division", "district", "upazila", "union", "street", "postOffice", "nidFront", "nidBack"] as const;

export function profileStrength(i: StrengthInput): { percent: number; missing: (typeof STRENGTH_KEYS)[number][] } {
  const missing = STRENGTH_KEYS.filter((k) => !i[k]);
  return { percent: Math.round(((STRENGTH_KEYS.length - missing.length) / STRENGTH_KEYS.length) * 100), missing };
}

export const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;
