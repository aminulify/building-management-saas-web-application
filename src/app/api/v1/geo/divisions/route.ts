import { route } from "@/lib/api/handler";
import { listDivisions } from "@/modules/geo/service";

export const GET = route(async () => listDivisions());
