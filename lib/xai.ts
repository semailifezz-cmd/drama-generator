// Uses Gemini 2.5 Flash via Kie.ai (OpenAI-compatible, synchronous)
const KIE_LLM_BASE = 'https://api.kie.ai/gemini-2.5-flash/v1'

export async function callGrok(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const apiKey = process.env.KIE_API_KEY
  if (!apiKey) throw new Error('KIE_API_KEY not configured. Add it to .env.local or Vercel env vars.')

  const response = await fetch(`${KIE_LLM_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages,
      stream: false,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 32768,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}
