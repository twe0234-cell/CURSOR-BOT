import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finance Tracker | מעקב פיננסי אישי',
  description: 'ניהול הכנסות, הוצאות ושווי נקי אישי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-assistant antialiased bg-[#0f1117] text-white min-h-screen">
        {children}
      </body>
    </html>
  )
}
