import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'חסר מפתח API של Gemini' }, { status: 500 })
    }

    const { rawText, fileName } = await req.json()
    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json({ error: 'חסר טקסט לפענוח' }, { status: 400 })
    }

    // Limit text to roughly 2000 lines to avoid massive token usage, assuming max 2000 tx
    const textToAnalyze = rawText.split('\n').slice(0, 2000).join('\n')

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const prompt = `You are an expert financial data extraction agent.
A user has uploaded a bank or credit card export file named "${fileName}".
The raw text of the file is provided below. It might contain metadata rows, headers, and transaction rows.
Your job is to extract ONLY the actual financial transactions and convert them into a structured JSON array.

Guidelines:
1. Identify the transaction rows. Skip any summary, balance, or header rows.
2. For each transaction, extract:
   - date: Format it strictly as YYYY-MM-DD.
   - amount: A number. Expenses/debits MUST be negative (-). Incomes/credits MUST be positive (+). Use your judgment based on the columns (e.g., if there's a "חובה" column, it's negative. If "זכות", it's positive).
   - description: The transaction description or business name.
3. If you can identify the bank or credit card company from the file text or headers, set 'source' to one of: 'hapoalim', 'leumi', 'discount', 'mizrahi', 'pagi', 'max', 'cal', 'isracard'. Otherwise use 'generic'.

Output MUST be strictly JSON matching this schema:
{
  "transactions": [
    { "date": "YYYY-MM-DD", "amount": number, "description": "string", "source": "string" }
  ]
}

Raw File Text:
${textToAnalyze}
`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const jsonText = response.text || '{}';
    const result = JSON.parse(jsonText);

    if (!result.transactions || !Array.isArray(result.transactions)) {
      throw new Error('הסוכן החזיר מבנה לא תקין')
    }

    return NextResponse.json({ success: true, transactions: result.transactions })

  } catch (e: unknown) {
    console.error('[AI Parse CSV Error]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
