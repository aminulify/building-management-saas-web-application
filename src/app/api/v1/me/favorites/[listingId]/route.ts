import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { addFavorite, removeFavorite } from "@/modules/marketplace/social.service";

export const PUT = route<{ listingId: string }>(async (req, { params }) => addFavorite(await requireActor(req), idParam((await params).listingId)));

export const DELETE = route<{ listingId: string }>(async (req, { params }) => removeFavorite(await requireActor(req), idParam((await params).listingId)));
