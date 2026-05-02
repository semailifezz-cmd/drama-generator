import type { UniversePrompt, SeriesBible, EpisodeOutline } from './types'

export const BIBLE_SYSTEM_PROMPT = `You are a professional drama series showrunner. Generate a complete series bible in valid JSON format. Output ONLY the raw JSON object — no markdown, no code fences, no explanations. Ensure all JSON strings are properly escaped.`

export function buildBiblePrompt(input: UniversePrompt): string {
  const charCount = input.main_characters.match(/\d+/)?.[0] ?? '4'

  return `Create a complete series bible for this drama:

Title: ${input.series_title}
Genre: ${input.genre}
Setting: ${input.setting_era}
Core Conflict: ${input.core_conflict}
Tone: ${input.tone}
Main Characters: ${input.main_characters}
Total Episodes: ${input.total_episodes}

Episode Formula (EVERY episode must follow this structure):
${input.episode_formula}

Output this EXACT JSON schema (no deviations):
{
  "series_title": "${input.series_title}",
  "genre": "${input.genre}",
  "overall_arc": "2-3 sentence description of the full series arc",
  "characters": [
    {
      "name": "Full Name",
      "age": "25",
      "role": "protagonist",
      "physical_description": "Height, build, hair color/style, face features, skin tone. Specific enough for image generation.",
      "personality": "Key personality traits",
      "outfit_style": "Signature clothing style",
      "image_prompt": "Photorealistic portrait, [exact physical description]. [outfit]. Cinematic lighting. Sharp focus. 4K."
    }
  ],
  "venues": [
    {
      "location_name": "Venue Name",
      "style": "Architectural and interior style",
      "lighting": "Lighting description",
      "time_of_day": "day/night/golden hour",
      "description": "Full location description",
      "image_prompt": "Photorealistic establishing shot, [detailed venue description]. [lighting]. Cinematic composition. 4K."
    }
  ],
  "props": [
    {
      "prop_name": "Prop Name",
      "visual_desc": "Detailed visual description",
      "owner_character": "Character Name",
      "image_prompt": "Photorealistic product shot, [prop description on neutral surface]. Studio lighting. High detail."
    }
  ],
  "episodes": [
    {
      "ep_num": 1,
      "title": "Episode Title",
      "summary": "2-3 sentence episode summary",
      "characters_featured": ["Name1", "Name2"],
      "venues_featured": ["Venue Name"],
      "key_plot_points": "Specific plot developments and formula step events"
    }
  ]
}

Requirements:
- Create exactly ${charCount} main characters (one must be the protagonist)
- Create 4-5 distinct venues
- Create 3-4 important props (items that recur across episodes)
- Generate all ${input.total_episodes} episode outlines
- Every episode must map to the formula (Step 1 = Clip 1, Step 2 = Clip 2, etc.)
- Make character physical descriptions very specific for image generation`
}

export const SCRIPT_SYSTEM_PROMPT = `You are a professional drama screenwriter. Generate scene-by-scene video prompts following the episode formula exactly. Output ONLY a valid JSON array. No markdown, no code fences.`

export function buildScriptPrompt(
  episode: EpisodeOutline,
  bible: SeriesBible,
  formula: string,
  prevMemo: string
): string {
  const charList = bible.characters
    .map(c => `- ${c.name} (${c.role}, age ${c.age}): ${c.physical_description}`)
    .join('\n')
  const venueList = bible.venues
    .map(v => `- ${v.location_name}: ${v.description}`)
    .join('\n')

  return `Generate 4 scene prompts for Episode ${episode.ep_num}: "${episode.title}"

Summary: ${episode.summary}
Key Plot Points: ${episode.key_plot_points}
Characters in this episode: ${episode.characters_featured.join(', ')}
Venues: ${episode.venues_featured.join(', ')}

Full Character Database:
${charList}

Available Venues:
${venueList}

${prevMemo ? `Continuity from previous episode:\n${prevMemo}\n` : ''}

EPISODE FORMULA — Every clip MUST map to its formula step:
${formula}

Output a JSON array of exactly 4 scene objects:
[
  {
    "ep_num": ${episode.ep_num},
    "scene_num": 1,
    "clip_num": 1,
    "formula_step": 1,
    "characters_used": ["Name1"],
    "venue_used": "Venue Name",
    "props_used": [],
    "raw_prompt": "Cinematic video description for Grok Imagine Video. Describe action, emotion, camera angle. Reference characters by NAME ONLY — do NOT describe their appearance (reference images are injected automatically). 2-4 sentences."
  }
]

Rules:
- Clip 1 → Formula Step 1, Clip 2 → Step 2, Clip 3 → Step 3, Clip 4 → Step 4
- Reference characters by name only, never by appearance description
- Be specific about camera angles (close-up, wide shot, etc.), emotions, and actions
- Ensure the formula_step matches the clip function (hook, turn, climax, exit)`
}
