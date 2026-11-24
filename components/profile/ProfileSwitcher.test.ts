import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { isTabInProfile } from '@/lib/profile'

describe('Profile Switching and Tab Filtering', () => {
  const originalProfileId = settings$.selectedProfileId.get()
  const originalLastProfileId = ui$.lastSelectedProfileId.get()

  beforeEach(() => {
    settings$.selectedProfileId.set('default')
    ui$.lastSelectedProfileId.set('default')
    tabs$.tabs.set([])
    tabs$.activeTabIndex.set(0)
    tabs$.orders.set({})
  })

  afterEach(() => {
    settings$.selectedProfileId.set(originalProfileId || 'default')
    ui$.lastSelectedProfileId.set(originalLastProfileId || 'default')
  })

  it('correctly checks whether a tab belongs to a profile with isTabInProfile', () => {
    const defaultTab = { id: '1', profile: 'default' }
    const noProfileTab = { id: '2' }
    const workTab = { id: '3', profile: 'work' }
    const anonTab = { id: '4', profile: 'anonymous' }
    const siteTab = { id: '5', profile: 'site:github.com' }

    // In 'default' profile:
    expect(isTabInProfile(defaultTab, 'default')).toBe(true)
    expect(isTabInProfile(noProfileTab, 'default')).toBe(true)
    expect(isTabInProfile(siteTab, 'default')).toBe(true)
    expect(isTabInProfile(workTab, 'default')).toBe(false)
    expect(isTabInProfile(anonTab, 'default')).toBe(false)

    // In 'work' profile:
    expect(isTabInProfile(workTab, 'work')).toBe(true)
    expect(isTabInProfile(defaultTab, 'work')).toBe(false)
    expect(isTabInProfile(noProfileTab, 'work')).toBe(false)

    // In 'all' profiles:
    expect(isTabInProfile(defaultTab, 'all')).toBe(true)
    expect(isTabInProfile(workTab, 'all')).toBe(true)
    expect(isTabInProfile(anonTab, 'all')).toBe(true)
  })

  it('persists selected profile in settings$ and falls back to default if deleted', () => {
    const newProfileId = settings$.addProfile('Personal', '#ec4899')
    expect(newProfileId).toBeDefined()

    settings$.selectedProfileId.set(newProfileId!)
    expect(settings$.selectedProfileId.get()).toBe(newProfileId)

    // Deleting the active profile resets selectedProfileId to 'default'
    settings$.deleteProfile(newProfileId!)
    expect(settings$.selectedProfileId.get()).toBe('default')
  })

  it('filters visible tabs according to selected profile', () => {
    tabs$.tabs.set([
      { id: 'tab-default-1', url: 'https://example.com/1', profile: 'default' },
      { id: 'tab-default-2', url: 'https://example.com/2' },
      { id: 'tab-work-1', url: 'https://work.com/1', profile: 'profile-work' },
      { id: 'tab-work-2', url: 'https://work.com/2', profile: 'profile-work' },
    ])

    const allTabs = tabs$.tabs.get()

    // When default profile is active:
    const defaultTabs = allTabs.filter((t) => isTabInProfile(t, 'default'))
    expect(defaultTabs.map((t) => t.id)).toEqual(['tab-default-1', 'tab-default-2'])

    // When work profile is active:
    const workTabs = allTabs.filter((t) => isTabInProfile(t, 'profile-work'))
    expect(workTabs.map((t) => t.id)).toEqual(['tab-work-1', 'tab-work-2'])

    // When all profiles are active:
    const allFiltered = allTabs.filter((t) => isTabInProfile(t, 'all'))
    expect(allFiltered).toHaveLength(4)
  })

  it('assigns active profile to newly opened tabs', () => {
    settings$.selectedProfileId.set('profile-work')
    ui$.lastSelectedProfileId.set('profile-work')

    const newTabId = tabs$.openTab('https://work-portal.example')
    const openedTab = tabs$.tabs.get().find((t) => t.id === newTabId)

    expect(openedTab?.profile).toBe('profile-work')
  })

  it('correctly resolves profile name for display', () => {
    // When default profile is active:
    settings$.selectedProfileId.set('default')
    const profiles = settings$.profiles.get()
    const defaultProfile = profiles.find((p) => p.id === 'default')
    expect(defaultProfile?.name || 'Default').toBe('Default')

    // When a custom profile is active:
    const customId = settings$.addProfile('Development', '#10b981')
    settings$.selectedProfileId.set(customId!)
    const currentProfile = settings$.profiles.get().find((p) => p.id === customId)
    expect(currentProfile?.name).toBe('Development')

    // Clean up
    settings$.deleteProfile(customId!)
  })
})
