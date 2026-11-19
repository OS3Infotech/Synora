import { batch } from '@legendapp/state'
import { genId } from '@/lib/utils'
import { getWatchTarget, watchKey } from './target'
import type { WatchTarget } from './types'
import type { watch$ } from '@/states/watch'

export interface CommunitySource {
  url: string
  name?: string
}

export interface DefaultCommunity {
  id: string
  name: string
  emoji: string
  description: string
  sources: CommunitySource[]
}

export const DEFAULT_AI_COMMUNITIES: DefaultCommunity[] = [
  {
    id: 'open-source-llms',
    name: 'Open-Source LLMs',
    emoji: '🤖',
    description: 'Local models, quantization, benchmarks, and open weights.',
    sources: [
      { url: 'https://www.reddit.com/r/LocalLLaMA/', name: 'r/LocalLLaMA' },
      { url: 'https://huggingface.co/blog/feed.xml', name: 'Hugging Face Blog' },
      { url: 'https://papers.cool/arxiv/feed', name: 'Trending Papers' },
    ],
  },
  {
    id: 'frontier-research',
    name: 'Frontier Research',
    emoji: '🧠',
    description: 'Foundational AI breakthroughs, lab research, and ArXiv papers.',
    sources: [
      { url: 'https://rss.arxiv.org/rss/cs.AI', name: 'ArXiv cs.AI' },
      { url: 'https://openai.com/news/rss.xml', name: 'OpenAI News' },
      { url: 'https://deepmind.google/blog/rss.xml', name: 'Google DeepMind' },
      { url: 'https://www.anthropic.com/feed.xml', name: 'Anthropic Research' },
    ],
  },
  {
    id: 'ai-agents',
    name: 'AI Agents & Tools',
    emoji: '🛠️',
    description: 'Autonomous agents, developer tooling, and production architectures.',
    sources: [
      { url: 'https://www.latent.space/feed', name: 'Latent Space' },
      { url: 'https://blog.langchain.dev/rss/', name: 'LangChain Blog' },
      { url: 'https://www.reddit.com/r/MachineLearning/', name: 'r/MachineLearning' },
    ],
  },
  {
    id: 'deep-dives',
    name: 'Deep Dives',
    emoji: '📰',
    description: 'In-depth AI analysis, newsletters, and technical tutorials.',
    sources: [
      { url: 'https://medium.com/towards-data-science', name: 'Towards Data Science' },
      { url: 'https://thesequence.substack.com', name: 'The Sequence' },
      { url: 'https://importai.substack.com', name: 'Import AI' },
      { url: 'https://medium.com/tag/artificial-intelligence', name: 'Medium AI Tag' },
    ],
  },
]

/**
 * Seeds the default AI communities into the watch store if they are not already present.
 * Preserves any existing profiles and timelines without overwriting them.
 */
export const seedDefaultCommunities = (watchStore: typeof watch$): string[] => {
  const existingTimelines = watchStore.timelines.peek()
  const createdIds: string[] = []

  batch(() => {
    for (const community of DEFAULT_AI_COMMUNITIES) {
      // Check if timeline with this name already exists
      const existing = existingTimelines.find((t) => t.name.toLowerCase() === community.name.toLowerCase())
      if (existing) continue

      const timelineId = genId()
      watchStore.timelines.push({
        id: timelineId,
        name: community.name,
        emoji: community.emoji,
      })
      createdIds.push(timelineId)

      for (const source of community.sources) {
        const target: WatchTarget | null = getWatchTarget(source.url)
        if (!target) continue

        const key = watchKey(target)
        const profileIndex = watchStore.profiles.peek().findIndex((p) => p.key === key)

        if (profileIndex === -1) {
          watchStore.profiles.push({
            key,
            site: target.site,
            handle: target.handle,
            name: source.name,
            url: source.url,
            addedAt: Date.now(),
            timelineId,
          })
        } else {
          // If profile already exists but has no timeline, assign to this community
          const profile = watchStore.profiles.peek()[profileIndex]
          if (!profile.timelineId) {
            watchStore.profiles[profileIndex].timelineId.set(timelineId)
          }
        }
      }
    }
  })

  return createdIds
}
