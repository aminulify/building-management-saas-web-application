import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: maps AppError / ZodError / unknown to `{ code, message, details }`. */
export function route<P = Record<string, string>>(
  fn: (req: Request, ctx: Ctx<P>) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json({ data: out });
    } catch (e) {
      if (e instanceof AppError) {
        return NextResponse.json({ code: e.code, message: e.message, details: e.details }, { status: e.status });
      }
      if (e instanceof ZodError) {
        const details = e.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message }));
        return NextResponse.json(
          { code: "VALIDATION_ERROR", message: "errors.VALIDATION_ERROR", details },
          { status: 422 },
        );
      }
      console.error(e);
      return NextResponse.json({ code: "INTERNAL", message: "errors.INTERNAL" }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", [{ path: "", code: "invalid_json" }]);
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}
