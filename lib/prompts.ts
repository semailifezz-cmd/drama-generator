import type { UniversePrompt, SeriesBible, EpisodeOutline } from './types'

export const BIBLE_SYSTEM_PROMPT = `You are a professional drama series showrunner. Your response must be a raw JSON object and nothing else — no greeting, no explanation, no markdown, no code fences. Start your response with { and end with }. Any text outside the JSON object will break the pipeline.`

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

export const SCRIPT_SYSTEM_PROMPT = `You are a professional drama screenwriter and cinematographer. Your response must be a raw JSON array and nothing else — no greeting, no explanation, no markdown, no code fences. Start your response with [ and end with ]. Any text outside the JSON array will break the pipeline.`

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
    .map(v => `- ${v.location_name}: ${v.description} | Lighting: ${v.lighting} | Time: ${v.time_of_day}`)
    .join('\n')

  return `Generate 4 detailed cinematic scene prompts for Episode ${episode.ep_num}: "${episode.title}"

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

Output a JSON array of exactly 4 scene objects with ALL of these fields:
[
  {
    "ep_num": ${episode.ep_num},
    "scene_num": 1,
    "clip_num": 1,
    "formula_step": 1,
    "segment_duration": "0–15s",
    "characters_used": ["Name1"],
    "venue_used": "Exact Venue Name from the list above",
    "props_used": [],
    "character_expressions": {
      "Name1": "Describe specific facial muscles engaged, eye state (darting/downcast/glassy/wide), lip position, jaw tension, brow position. Include any micro-expressions that betray hidden emotion. Example: 'Brows drawn together and raised at inner corners, lips pressed thin, jaw slightly clenched. Micro-expression of contempt flickers as she glances at ex — upper lip barely lifts on one side before the mask re-sets.'"
    },
    "character_actions": {
      "Name1": "Precise physical actions in sequence: posture, hand/arm position, movement direction, speed, and any object interaction. Example: 'Enters doorway and freezes mid-step upon recognising crowd. Slowly straightens spine. Grips clutch bag with both hands, knuckles whitening. Takes two deliberate steps forward then stops when a guest brushes past without acknowledgement.'"
    },
    "camera_angle": "Specific shot type and camera angle — e.g. 'Low-angle medium shot looking up at protagonist, emphasising vulnerability' or 'Over-the-shoulder tight two-shot'. Be precise about lens/framing.",
    "camera_movement": "Camera motion during the clip — e.g. 'Static wide establishing, then slow dolly-push to chest-level medium on protagonist face', 'Handheld slight sway for unease', 'Smooth 180° arc around kneeling antagonists'.",
    "atmosphere": "Overall mood and environmental texture: crowd density and behaviour, sound-scape (implied), spatial relationships between characters, any symbolic staging or blocking details that reinforce the formula step.",
    "color_ambience": "Color palette and lighting tone — e.g. 'Warm champagne-gold saturates the crowd; protagonist lit in cooler, slightly desaturated tones to create visual isolation. Soft rim light separates her from background.'",
    "raw_prompt": "Complete 4–6 sentence cinematic video prompt for Grok Imagine Video. Weave together the venue, character actions, expressions, camera work, atmosphere, and color into one fluid description. Reference characters by NAME ONLY — never describe appearance (reference images are injected automatically). This is the prompt sent to the video model so make it rich and specific."
  }
]

Strict rules:
- Clip 1 → Formula Step 1, Clip 2 → Step 2, Clip 3 → Step 3, Clip 4 → Step 4
- ONLY reference characters by name — never describe hair/eyes/clothing/body (reference images handle that)
- character_expressions and character_actions must cover every name in characters_used
- raw_prompt must integrate all elements into a single cohesive cinematic description
- segment_duration must match: Clip 1 → "0–15s", Clip 2 → "15–30s", Clip 3 → "30–45s", Clip 4 → "45–60s"`
}
