import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'חסר מפתח API של Gemini' }, { status: 500 })
    }

    // Fetch data for the user
    const [txRes, recRes] = await Promise.all([
      supabase.from('transactions').select('date, amount, description').eq('user_id', user.id).order('date', { ascending: false }).limit(100),
      supabase.from('recurring_expenses').select('name, amount, frequency').eq('user_id', user.id)
    ])

    const transactions = txRes.data || []
    const recurring = recRes.data || []

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    const prompt = `You are a warm, highly intelligent financial coach and agent.
Your user needs a "Personal Area" summary of their recent financial behavior.
Analyze the following latest transactions and recurring expenses.

Transactions (last 100):
${JSON.stringify(transactions)}

Recurring Expenses:
${JSON.stringify(recurring)}

Output MUST be strictly JSON matching this schema:
{
  "compliments": ["string - 2 to 3 warm compliments on good behavior, saving, or specific goals they seem to be meeting (in Hebrew)"],
  "alerts": ["string - 1 to 2 gentle alerts about high spending in specific areas or unused subscriptions (in Hebrew)"],
  "goals": [
    { "title": "string - short title (e.g. 'חיסכון לשעת חירום')", "progress": number (0-100), "tip": "string - actionable tip" }
  ],
  "overallScore": number (0-100, representing their financial health based on income vs expenses),
  "summary": "string - A short 2 sentence warm greeting and summary of their current situation (in Hebrew)"
}

Be encouraging, use emojis where appropriate, and ensure everything is in Hebrew.
`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    });

    const jsonText = response.text || '{}';
    const result = JSON.parse(jsonText);

    return NextResponse.json({ success: true, data: result })

  } catch (e: unknown) {
    console.error('[AI Personal Error]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
