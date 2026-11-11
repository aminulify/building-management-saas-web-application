import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { homeTable, homeTableQuery } from "@/modules/admin/manage-home/service";

/** Manage Find Home table: rental or buy/sell mode, status / occupancy / sale-status filters, cursor paging. */
export const GET = route(async (req) => homeTable(await requireActor(req), parseQuery(req, homeTableQuery)));
