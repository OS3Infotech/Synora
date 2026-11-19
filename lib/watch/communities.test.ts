import { describe, expect, it } from 'bun:test'
import { observable } from '@legendapp/state'
import { DEFAULT_AI_COMMUNITIES, seedDefaultCommunities } from './communities'
import { getWatchTarget } from './target'

describe('DEFAULT_AI_COMMUNITIES', () => {
  it('defines 4 valid AI communities with working source URLs', () => {
    expect(DEFAULT_AI_COMMUNITIES.length).toBe(4)

    for (const community of DEFAULT_AI_COMMUNITIES) {
      expect(community.name).toBeTruthy()
      expect(community.emoji).toBeTruthy()
      expect(community.sources.length).toBeGreaterThan(0)

      for (const source of community.sources) {
        const target = getWatchTarget(source.url)
        expect(target).not.toBeNull()
        expect(target?.site).toBeTruthy()
        expect(target?.handle).toBeTruthy()
      }
    }
  })

  it('seeds communities and profiles idempotently into watchStore', () => {
    const mockStore: any = observable({
      timelines: [],
      profiles: [],
    })

    // First seed
    const createdIds = seedDefaultCommunities(mockStore)
    expect(createdIds.length).toBe(4)
    expect(mockStore.timelines.peek().length).toBe(4)
    expect(mockStore.profiles.peek().length).toBeGreaterThan(5)

    // Second seed should do nothing
    const secondSeed = seedDefaultCommunities(mockStore)
    expect(secondSeed.length).toBe(0)
    expect(mockStore.timelines.peek().length).toBe(4)
  })
})

