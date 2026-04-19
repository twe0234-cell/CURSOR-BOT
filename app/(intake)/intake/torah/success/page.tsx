import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TorahIntakeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[oklch(0.95_0.04_82)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-10 w-10 text-[oklch(0.26_0.068_265)]"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>

      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-[oklch(0.26_0.068_265)] md:text-4xl">
        תודה, קיבלנו את פנייתך
      </h1>

      <div className="mx-auto my-5 h-[2px] w-20 bg-gradient-to-l from-transparent via-[oklch(0.73_0.13_80)] to-transparent" />

      <p className="max-w-lg text-base text-neutral-700">
        שלחנו אליך אימייל עם סיכום הפרטים. נחזור אליך טלפונית בימים הקרובים עם הצעת מחיר.
      </p>

      {id ? (
        <p className="mt-4 text-xs text-neutral-500">
          מספר פנייה לצורך מעקב: <span className="font-mono">{id}</span>
        </p>
      ) : null}

      <Link
        href="/intake/torah"
        className="mt-8 inline-block rounded-lg border border-[oklch(0.73_0.13_80)] px-5 py-2.5 text-sm text-[oklch(0.26_0.068_265)] transition hover:bg-[oklch(0.95_0.04_82)]"
      >
        שליחת פנייה נוספת
      </Link>
    </main>
  );
}
