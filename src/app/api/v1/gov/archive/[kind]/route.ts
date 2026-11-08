import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { archiveKind, archiveQuery, listArchive } from "@/modules/directory/service";

export const GET = route<{ kind: string }>(async (req, { params }) =>
  listArchive(await requireActor(req), archiveKind.parse((await params).kind), parseQuery(req, archiveQuery), parseQuery(req, pageQuery)),
);
