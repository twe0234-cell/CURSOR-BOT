import TorahIntakeForm from "./TorahIntakeForm";

export const dynamic = "force-dynamic";

export default function TorahIntakePage() {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <header className="mb-10 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.95_0.04_82)] text-[oklch(0.26_0.068_265)]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        <h1
          className="font-[family-name:var(--font-display)] text-3xl font-bold text-[oklch(0.26_0.068_265)] md:text-4xl"
        >
          קליטת ספרי קודש
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600 md:text-base">
          מלא את הטופס כדי לקבל הצעת מחיר עבור ספר תורה, תפילין או מזוזה. נחזור אליך בהקדם.
        </p>
        <div className="mx-auto mt-4 h-[2px] w-20 bg-gradient-to-l from-transparent via-[oklch(0.73_0.13_80)] to-transparent" />
      </header>

      <TorahIntakeForm turnstileSiteKey={turnstileSiteKey} />

      <footer className="mt-10 text-center text-xs text-neutral-500">
        הידור הסת״ם · הפרטים נשמרים בסודיות ומשמשים לצורך הצעת המחיר בלבד
      </footer>
    </main>
  );
}
