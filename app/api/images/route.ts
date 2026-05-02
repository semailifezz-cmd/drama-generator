import { NextRequest, NextResponse } from 'next/server'
import { submitImageJob } from '@/lib/kie'

export async function POST(req: NextRequest) {
  if (!process.env.KIE_API_KEY) {
    return NextResponse.json(
      { error: 'KIE_API_KEY is not configured.' },
      { status: 503 }
    )
  }

  const { prompt } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  try {
    const taskId = await submitImageJob(prompt)
    return NextResponse.json({ jobId: taskId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
