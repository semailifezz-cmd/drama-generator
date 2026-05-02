import { NextRequest, NextResponse } from 'next/server'
import { submitVideoJob } from '@/lib/kie'

export async function POST(req: NextRequest) {
  if (!process.env.KIE_API_KEY) {
    return NextResponse.json(
      { error: 'KIE_API_KEY is not configured.' },
      { status: 503 }
    )
  }

  const { prompt, image_urls, duration, aspect_ratio, resolution } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  try {
    const taskId = await submitVideoJob({
      prompt,
      image_urls: image_urls ?? [],
      duration: duration ?? 15,
      aspect_ratio: aspect_ratio ?? '9:16',
      resolution: resolution ?? '720p',
    })
    return NextResponse.json({ jobId: taskId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
