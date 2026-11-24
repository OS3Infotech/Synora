import { settings$, type Profile } from '@/states/settings'
import { getSiteFromProfileId, isSiteProfileId } from './site-profile'
import { getDeterministicProfileColor } from './profile-color'
import { isFeedTabUrl } from './feed-tab'

export const isTabInProfile = (tab: { url?: string; profile?: string }, profileId: string): boolean => {
  if (!profileId || profileId === 'all') return true
  if (isFeedTabUrl(tab.url)) return true
  const tabProfile = tab.profile || 'default'
  if (tabProfile === profileId) return true
  if (isSiteProfileId(tabProfile)) return true
  return false
}

/** Reserve the stripe's space for alignment, but show profile colors only on web tabs. */
export const getTabColor = (tab: { url?: string; profile?: string }) =>
  isFeedTabUrl(tab.url) ? 'transparent' : getProfileColor(tab.profile)

export const getProfileColor = (profileId?: string) => {
  const site = getSiteFromProfileId(profileId)
  if (site) {
    return getDeterministicProfileColor(site)
  }

  const profiles = settings$.profiles.get() as (Profile | null | undefined)[] | undefined
  const sanitized = (profiles || []).filter((p): p is Profile => p != null)
  if (!sanitized.length) {
    return undefined
  }
  const defaultProfile = sanitized.find((p) => p.id === 'default') || sanitized[0]
  const activeProfile = sanitized.find((p) => p.id === (profileId || defaultProfile.id))
  return activeProfile?.color || defaultProfile.color
}
