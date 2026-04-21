import PersonalAreaClient from '@/components/dashboard/PersonalAreaClient'

export default function PersonalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">האיזור האישי שלי</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          ניתוח חכם של ההתנהלות הפיננסית שלך, חיזוקים ויעדים אישיים
        </p>
      </div>

      <PersonalAreaClient />
    </div>
  )
}
