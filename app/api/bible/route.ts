import { NextRequest, NextResponse } from 'next/server'
import { callGrok } from '@/lib/xai'
import { BIBLE_SYSTEM_PROMPT, buildBiblePrompt } from '@/lib/prompts'
import type { UniversePrompt } from '@/lib/types'

export async function POST(req: NextRequest) {
  if (!process.env.KIE_API_KEY) {
    return NextResponse.json(
      { error: 'KIE_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 503 }
    )
  }

  const input: UniversePrompt = await req.json()

  if (!input.series_title || !input.genre || !input.core_conflict) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const userPrompt = buildBiblePrompt(input)
    const raw = await callGrok(
      [
        { role: 'system', content: BIBLE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.85, maxTokens: 32768 }
    )

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const bible = JSON.parse(cleaned)
    return NextResponse.json(bible)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
