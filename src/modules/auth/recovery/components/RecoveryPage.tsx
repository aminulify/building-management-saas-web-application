import { AmbientBackground } from "@/components/glass/AmbientBackground";
import { AuthCard } from "@/modules/auth/components/AuthCard";
import { GuestOnly } from "@/modules/auth/components/GuestOnly";

/** Shared frame of the three recovery pages: ambient blobs + glass card, for signed-out visitors only. */
export function RecoveryPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 sm:py-12">
      <AmbientBackground />
      <GuestOnly>
        <AuthCard className="max-w-xl">{children}</AuthCard>
      </GuestOnly>
    </main>
  );
}
