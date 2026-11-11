"use client";

import { clsx } from "clsx";
import { initials } from "./logic";

const TINTS = ["bg-sky-100 text-sky-500", "bg-emerald-100 text-emerald-500", "bg-violet-100 text-violet-500", "bg-amber-100 text-amber-600", "bg-pink-100 text-pink-500"];
const tint = (name: string) => TINTS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TINTS.length]!;

interface Props { name: string; url?: string | null; size?: string; online?: boolean; className?: string }

/** Round picture, or coloured initials when there is none; an optional green dot shows who is online. */
export function PersonAvatar({ name, url, size = "size-12", online, className }: Props) {
  return (
    <span className={clsx("relative inline-grid shrink-0 place-items-center rounded-full font-semibold", size, !url && tint(name), className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full rounded-full object-cover" /> : <span aria-hidden className="text-[0.85em]">{initials(name)}</span>}
      {online !== undefined && <span aria-hidden className={clsx("absolute bottom-0 right-0 size-3 rounded-full border-2 border-white", online ? "bg-emerald-500" : "bg-slate-300")} />}
    </span>
  );
}
