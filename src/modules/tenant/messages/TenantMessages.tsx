"use client";

import { MessagesView } from "@/modules/messaging/ui/MessagesView";
import { useTenant } from "../shell/TenantContext";

/** The Message page inside the tenant frame: a tenant can write to the owner of their home (and Support). */
export function TenantMessages() {
  const { me } = useTenant();
  return <MessagesView meId={me.id} role={me.role} />;
}
