import { z } from "zod";

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. */
export const forgotFormSchema = z.object({
  email: z.string().trim().min(1, "emailRequired").email("emailInvalid").max(120, "tooLong"),
});
export type ForgotFormValues = z.input<typeof forgotFormSchema>;

export const OTP_LENGTH = 6;

/** The four rules shown live under the password fields (all must be true to submit). */
export function passwordRules(password: string, confirm: string) {
  return {
    length: password.length >= 8,
    number: /\d/.test(password),
    case: /[a-z]/.test(password) && /[A-Z]/.test(password),
    match: password.length > 0 && password === confirm,
  };
}
export type PasswordRuleKey = keyof ReturnType<typeof passwordRules>;
export const RULE_KEYS: PasswordRuleKey[] = ["length", "number", "case", "match"];
export const allRulesMet = (password: string, confirm: string) => Object.values(passwordRules(password, confirm)).every(Boolean) && password.length <= 72;
