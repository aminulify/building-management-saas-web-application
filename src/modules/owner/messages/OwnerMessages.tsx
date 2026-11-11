"use client";

import { MessagesView } from "@/modules/messaging/ui/MessagesView";
import { useOwner } from "../shell/OwnerContext";

/** The Message page inside the owner frame: the owner can write to the tenants of their own properties (and Support). */
export function OwnerMessages() {
  const { me } = useOwner();
  return <MessagesView meId={me.id} role={me.role} />;
}
