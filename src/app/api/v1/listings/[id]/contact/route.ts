import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { revealContact } from "@/modules/marketplace/social.service";

/** The seller's phone for the "Call Owner" button (signed-in people only, rate limited, audited). */
export const GET = route<{ id: string }>(async (req, { params }) => revealContact(await requireActor(req), idParam((await params).id), req));
