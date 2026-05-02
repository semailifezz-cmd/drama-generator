const KIE_BASE = 'https://api.kie.ai/v1'

function authHeaders() {
  const apiKey = process.env.KIE_API_KEY
  if (!apiKey) throw new Error('KIE_API_KEY not configured')
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function submitImageJob(prompt: string): Promise<string> {
  const res = await fetch(`${KIE_BASE}/grok/imagine/image`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) throw new Error(`Image submit failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.request_id ?? data.id
}

export async function pollImage(jobId: string): Promise<{ status: string; image_url?: string }> {
  const apiKey = process.env.KIE_API_KEY
  if (!apiKey) throw new Error('KIE_API_KEY not configured')
  const res = await fetch(`${KIE_BASE}/grok/imagine/image/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Image poll failed: ${res.status}`)
  const data = await res.json()
  return { status: data.status, image_url: data.image?.url }
}

export async function submitVideoJob(payload: {
  prompt: string
  image_urls: string[]
  duration: number
  aspect_ratio: string
  resolution: string
}): Promise<string> {
  const res = await fetch(`${KIE_BASE}/grok/imagine/video`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model: 'grok-imagine-video', ...payload }),
  })
  if (!res.ok) throw new Error(`Video submit failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.request_id ?? data.id
}

export async function pollVideo(jobId: string): Promise<{ status: string; url?: string }> {
  const apiKey = process.env.KIE_API_KEY
  if (!apiKey) throw new Error('KIE_API_KEY not configured')
  const res = await fetch(`${KIE_BASE}/grok/imagine/video/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Video poll failed: ${res.status}`)
  const data = await res.json()
  return { status: data.status, url: data.video?.url }
}
