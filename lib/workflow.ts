import type { SeriesBible, EpisodeScript, EpisodeOutline } from './types'

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function buildContinuityMemo(episode: EpisodeOutline): string {
  return `Episode ${episode.ep_num} "${episode.title}" ended with: ${episode.summary}. Characters involved: ${episode.characters_featured.join(', ')}.`
}

export function injectRefUrls(
  scripts: EpisodeScript[],
  refImages: Record<string, string>,
  bible: SeriesBible
): EpisodeScript[] {
  return scripts.map(episode => ({
    ...episode,
    scenes: episode.scenes.map(scene => {
      const refs: string[] = []

      // Protagonist always @image1
      const protagonist = bible.characters.find(c => c.role === 'protagonist')
      if (protagonist && refImages[protagonist.name]) {
        refs.push(refImages[protagonist.name])
      }

      // Other characters in scene
      for (const charName of scene.characters_used) {
        const char = bible.characters.find(c => c.name === charName)
        if (char && refImages[char.name] && !refs.includes(refImages[char.name])) {
          refs.push(refImages[char.name])
        }
      }

      // Venue as last reference
      if (scene.venue_used && refImages[scene.venue_used] && refs.length < 6) {
        refs.push(refImages[scene.venue_used])
      }

      const finalRefs = refs.slice(0, 7)

      return {
        ...scene,
        final_prompt: scene.raw_prompt, // image_urls passed separately — no @imageN tags needed
        grok_ref_images: finalRefs,
      }
    }),
  }))
}
