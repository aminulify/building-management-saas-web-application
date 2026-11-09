import Image from "next/image";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

/** English UI → amaderghor-logo-EN.png, Bangla UI → amaderghor-logo-BN.png (docs: pages.md §14). */
export function Logo({ height = 40, href = "/" }: { height?: number; href?: string }) {
  const locale = useLocale();
  const isBn = locale === "bn";
  const [w, h] = isBn ? [423, 95] : [543, 95];
  return (
    <Link href={href} aria-label="AmaderGhor" className="inline-flex">
      <Image
        src={`/images/amaderghor-logo-${isBn ? "BN" : "EN"}.png`}
        alt="AmaderGhor"
        width={Math.round((w / h) * height)}
        height={height}
        priority
        style={{ height, width: "auto" }}
      />
    </Link>
  );
}
