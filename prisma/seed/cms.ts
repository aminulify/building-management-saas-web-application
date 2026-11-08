import type { PrismaClient } from "@prisma/client";

const BLOCKS: { key: string; locale: string; data: object }[] = [
  { key: "home.hero", locale: "en", data: { title: "Find, manage and rent homes in Bangladesh", description: "One platform for landlords, tenants, supervisors and government.", image: null } },
  { key: "home.hero", locale: "bn", data: { title: "বাংলাদেশে বাড়ি খুঁজুন, ভাড়া ও ব্যবস্থাপনা করুন", description: "বাড়িওয়ালা, ভাড়াটিয়া, সুপারভাইজার ও সরকারি প্রতিনিধির জন্য এক প্ল্যাটফর্ম।", image: null } },
  { key: "about", locale: "en", data: { company: "AmaderGhor", description: "Property management and real estate marketplace for Bangladesh.", mission: "Make renting transparent and safe.", vision: "Every home managed digitally.", images: [] } },
  { key: "about", locale: "bn", data: { company: "আমাদের ঘর", description: "বাংলাদেশের জন্য প্রপার্টি ম্যানেজমেন্ট ও রিয়েল এস্টেট মার্কেটপ্লেস।", mission: "ভাড়া হোক স্বচ্ছ ও নিরাপদ।", vision: "প্রতিটি বাড়ি ডিজিটালি ব্যবস্থাপিত।", images: [] } },
];

export async function seedCms(db: PrismaClient) {
  for (const b of BLOCKS) await db.cmsContent.upsert({ where: { key_locale: { key: b.key, locale: b.locale } }, update: {}, create: b });
}
