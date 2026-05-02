const XAI_BASE = 'https://api.x.ai/v1'

export async function callGrok(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY not configured')

  const response = await fetch(`${XAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 32768,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`xAI API error ${response.status}: ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}
