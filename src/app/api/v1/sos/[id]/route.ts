import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { alertDetail } from "@/modules/emergency/sos.service";

/** Incident log of one alert: for the person who raised it and the landlord of that property. */
export const GET = route<{ id: string }>(async (req, { params }) => alertDetail(await requireActor(req), idParam((await params).id)));
