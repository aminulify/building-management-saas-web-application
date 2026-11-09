import { NextResponse } from "next/server";

/** Unknown /api/v1 paths answer with the same JSON error shape as every other endpoint, not an HTML 404 page. */
const notFound = () => NextResponse.json({ code: "NOT_FOUND", message: "errors.NOT_FOUND" }, { status: 404 });
export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
