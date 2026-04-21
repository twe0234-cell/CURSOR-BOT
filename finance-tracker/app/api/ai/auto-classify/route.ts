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

    // Fetch unclassified transactions
    const { data: unclassified } = await supabase
      .from('transactions')
      .select('id, description, amount, date')
      .eq('user_id', user.id)
      .is('category_id', null)
      .order('date', { ascending: false })
      .limit(50)

    if (!unclassified || unclassified.length === 0) {
      return NextResponse.json({ message: 'אין תנועות לסיווג' })
    }

    // Fetch categories
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', user.id)

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    const prompt = `You are a strict financial AI agent.
Your goal is to automatically classify bank transactions into predefined categories and identify recurring expenses.
Do not invent new category IDs. Only use the provided category IDs.
If a transaction doesn't fit any category, use category_id: null.

Categories:
${JSON.stringify(categories)}

Transactions to classify:
${JSON.stringify(unclassified)}

Also, if you notice any transaction that looks like a recurring monthly bill or subscription (e.g., Netflix, Gym, Insurance, Bank fees), add a suggested rule for it.

Output MUST be strictly JSON matching this schema:
{
  "classifications": [
    { "tx_id": "uuid", "category_id": "uuid" }
  ],
  "new_rules": [
    { "pattern": "unique keyword from description", "category_id": "uuid" }
  ],
  "recurring_suggestions": [
    { "name": "Name of service", "amount": number, "category_id": "uuid" }
  ]
}
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

    // Apply classifications
    if (result.classifications && result.classifications.length > 0) {
      for (const cls of result.classifications) {
        if (cls.category_id) {
          await supabase.from('transactions')
            .update({ category_id: cls.category_id })
            .eq('id', cls.tx_id)
            .eq('user_id', user.id)
        }
      }
    }

    // Add new rules
    if (result.new_rules && result.new_rules.length > 0) {
      for (const rule of result.new_rules) {
        if (rule.category_id && rule.pattern) {
          try {
            await supabase.from('classification_rules').insert({
              user_id: user.id,
              pattern: rule.pattern,
              category_id: rule.category_id,
              match_type: 'contains',
              priority: 50
            })
          } catch (e) { /* ignore */ }
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      classified_count: result.classifications?.length || 0,
      rules_added: result.new_rules?.length || 0,
      recurring_suggestions: result.recurring_suggestions || []
    })

  } catch (e: unknown) {
    console.error('[AI Auto-Classify Error]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }
}
