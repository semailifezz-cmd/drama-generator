export interface UniversePrompt {
  series_title: string
  genre: string
  setting_era: string
  core_conflict: string
  tone: string
  main_characters: string
  total_episodes: number
  episode_length_s: number
  clip_length_s: number
  episode_formula: string
}

export interface Character {
  name: string
  age: string
  role: 'protagonist' | 'antagonist' | 'supporting'
  physical_description: string
  personality: string
  outfit_style: string
  image_prompt: string
  ref_image_url?: string
}

export interface Venue {
  location_name: string
  style: string
  lighting: string
  time_of_day: string
  description: string
  image_prompt: string
  ref_image_url?: string
}

export interface Prop {
  prop_name: string
  visual_desc: string
  owner_character: string
  image_prompt: string
  ref_image_url?: string
}

export interface EpisodeOutline {
  ep_num: number
  title: string
  summary: string
  characters_featured: string[]
  venues_featured: string[]
  key_plot_points: string
}

export interface SeriesBible {
  series_title: string
  genre: string
  overall_arc: string
  characters: Character[]
  venues: Venue[]
  props: Prop[]
  episodes: EpisodeOutline[]
}

export interface ScenePrompt {
  ep_num: number
  scene_num: number
  clip_num: number
  formula_step: number
  characters_used: string[]
  venue_used: string
  props_used: string[]
  raw_prompt: string
  final_prompt?: string
  grok_ref_images?: string[]
  video_job_id?: string
  video_status?: 'pending' | 'processing' | 'done' | 'failed'
  video_url?: string
}

export interface EpisodeScript {
  ep_num: number
  scenes: ScenePrompt[]
}
