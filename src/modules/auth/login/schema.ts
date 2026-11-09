import { z } from "zod";

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. */
export const loginFormSchema = z.object({
  identifier: z.string().trim().min(1, "identifierRequired").min(3, "identifierShort").max(120, "tooLong"),
  password: z.string().min(1, "passwordRequiredLogin").max(72, "tooLong"),
  remember: z.boolean(),
});

export type LoginFormValues = z.input<typeof loginFormSchema>;
