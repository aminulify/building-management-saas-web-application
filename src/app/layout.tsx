// The <html>/<body> shell lives in app/[locale]/layout.tsx (it needs the locale for lang + fonts).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
