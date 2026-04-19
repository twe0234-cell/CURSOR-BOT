import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "קליטת ספרי קודש — הידור הסת״ם",
  description: "טופס קליטה ציבורי לבעלי ספרי תורה, תפילין ומזוזות המעוניינים במכירה",
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[oklch(0.984_0.006_80)]">{children}</div>;
}
