"use client";

import { useState } from "react";
import { MessagesView } from "@/modules/messaging/ui/MessagesView";
import { useAdmin } from "../shell/AdminContext";
import { PersonModal } from "./PersonModal";

/** Super Admin → Message: chats and calls with anyone (Tenant Free, Tenants, Owners, Government), with search and a kind-of-person filter. Click the person's name or picture for the full profile and Active / Warning / Suspended. */
export function AdminMessages() {
  const me = useAdmin();
  const [person, setPerson] = useState<{ id: string; fullName: string; avatarUrl: string | null } | null>(null);
  return (
    <>
      <MessagesView meId={me.id} role={me.role} onProfile={(p) => setPerson({ id: p.id, fullName: p.fullName, avatarUrl: p.avatarUrl })} />
      <PersonModal person={person} onClose={() => setPerson(null)} />
    </>
  );
}
