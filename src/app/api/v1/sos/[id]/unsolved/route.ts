import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { reopenUnsolved } from "@/modules/emergency/sos.service";

/** "Unsolved": the reporter says a SOLVED alert is not solved. It is reopened (PROCESSING) and the landlord and government team are alerted. */
export const POST = route<{ id: string }>(async (req, { params }) => reopenUnsolved(await requireActor(req), idParam((await params).id), req));
