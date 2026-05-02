import { NextRequest, NextResponse } from 'next/server'
import { callGrok } from '@/lib/xai'
import { SCRIPT_SYSTEM_PROMPT, buildScriptPrompt } from '@/lib/prompts'
import type { SeriesBible, EpisodeOutline, EpisodeScript } from '@/lib/types'

function extractArray(raw: string): string | null {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  return raw.slice(start, end + 1)
}

function sanitizeJson(s: string): string {
  return s.replace(/[ -]/g, c => {
    const map: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' }
    return map[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  })
}

function parseContext(json: string, err: SyntaxError): string {
  const posMatch = err.message.match(/position (\d+)/)
  if (!posMatch) return json.slice(0, 300)
  const pos = parseInt(posMatch[1])
  const from = Math.max(0, pos - 120)
  const to = Math.min(json.length, pos + 120)
  return `…${json.slice(from, to)}…  ← error near position ${pos}`
}

export async function POST(req: NextRequest) {
  if (!process.env.KIE_API_KEY) {
    return NextResponse.json(
      { error: 'KIE_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 503 }
    )
  }

  const { episode, bible, formula, prevMemo }: {
    episode: EpisodeOutline
    bible: SeriesBible
    formula: string
    prevMemo: string
  } = await req.json()

  try {
    const userPrompt = buildScriptPrompt(episode, bible, formula, prevMemo)
    const raw = await callGrok(
      [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.9, maxTokens: 8192 }
    )

    const extracted = extractArray(raw)
    if (!extracted) {
      return NextResponse.json(
        { error: `Ep ${episode.ep_num}: Gemini returned no JSON array. Response starts with: "${raw.slice(0, 300)}"` },
        { status: 500 }
      )
    }

    let scenes
    try {
      scenes = JSON.parse(extracted)
    } catch (e1) {
      try {
        scenes = JSON.parse(sanitizeJson(extracted))
      } catch (e2) {
        const err = e2 instanceof SyntaxError ? e2 : e1 instanceof SyntaxError ? e1 : null
        const context = err ? parseContext(sanitizeJson(extracted), err) : extracted.slice(0, 300)
        return NextResponse.json(
          { error: `Ep ${episode.ep_num} script JSON parse error — ${err?.message ?? 'unknown'}. Context: "${context}"` },
          { status: 500 }
        )
      }
    }

    const script: EpisodeScript = { ep_num: episode.ep_num, scenes }
    return NextResponse.json(script)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `scripts/route ep${episode.ep_num}: ${message}` }, { status: 500 })
  }
}
