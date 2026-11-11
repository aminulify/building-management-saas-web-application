"use client";

/** Fills its parent with the photo, or with the initials on the brand gradient when there is none. */
export function PersonAvatarLike({ name, url }: { name: string; url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
  return <span aria-hidden className="grid size-full place-items-center bg-brand-gradient text-3xl font-bold text-white">{initials}</span>;
}
