import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })

    const now = new Date()
    // get this month and last month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

    const [{ data: txs }, { data: recurring }] = await Promise.all([
      supabase.from('transactions').select('date,amount,description,category_id').eq('user_id', user.id).gte('date', lastMonthStart).lt('date', nextMonthStart).order('date'),
      supabase.from('recurring_expenses').select('name,amount,frequency,payment_day,payment_method').eq('user_id', user.id),
    ])

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'חסר מפתח API של Gemini בסביבה' }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    const prompt = `You are an elite, highly analytical personal finance AI agent operating in a strict JSON format.
Your objective is to provide sharp, concise, anomaly-focused financial insights based on the provided user data.
DO NOT provide generic financial advice (e.g., "save money", "invest in stocks").
Focus strictly on:
1. Significant changes in spending between last month and this month.
2. Large or unusual transactions.
3. Duplications or suspected double charges.
4. Alerts regarding recurring expenses.

Return your response STRICTLY as a JSON object matching this schema:
{
  "insights": [
    {
      "type": "anomaly" | "warning" | "positive",
      "message": "A short, punchy sentence in Hebrew describing the insight. Address the user directly ('הוצאת', 'שילמת').",
      "amount": (optional) a number representing the financial value involved (e.g., 350)
    }
  ]
}

Data:
Current Month Start: ${thisMonthStart}
Transactions (Last 2 months): ${JSON.stringify(txs)}
Recurring Expenses: ${JSON.stringify(recurring)}

Remember: output MUST be valid JSON only. No markdown formatting, no code blocks, just raw JSON.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const jsonText = response.text || '{"insights": []}';
    return NextResponse.json(JSON.parse(jsonText))

  } catch (e: unknown) {
    console.error('[AI Insights Error]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בשרת ה-AI' }, { status: 500 })
  }
}
