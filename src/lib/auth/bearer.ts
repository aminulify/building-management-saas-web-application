import { AppError } from "../errors";

export function bearerToken(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) throw new AppError("UNAUTHENTICATED");
  return h.slice(7);
}
