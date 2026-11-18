import { describe, expect, it } from 'bun:test'
import { isAuthCallbackUrl } from './auth-callback'
import { isExternalAppUrl } from './url-schemes'
import { getHomeUrl } from './page'
import { feedTabUrl } from './feed-tab'

describe('isAuthCallbackUrl', () => {
  it('matches the legacy nora:auth callback format', () => {
    expect(isAuthCallbackUrl('nora:auth?t=token')).toBe(true)
  })

  it('ignores non-auth nora deep links', () => {
    expect(isAuthCallbackUrl('nora://settings')).toBe(false)
  })

  it('ignores normal web urls', () => {
    expect(isAuthCallbackUrl('https://nora.inks.page/auth/app')).toBe(false)
  })
})

describe('isExternalAppUrl', () => {
  it('treats mailto links as external app urls', () => {
    expect(isExternalAppUrl('mailto:test@example.com')).toBe(true)
  })

  it('keeps normal web urls inside Nora', () => {
    expect(isExternalAppUrl('https://example.com')).toBe(false)
  })
})

describe('getHomeUrl', () => {
  it('returns valid URLs for blogging platforms', () => {
    expect(getHomeUrl('medium')).toBe('https://medium.com')
    expect(getHomeUrl('substack')).toBe('https://substack.com')
    expect(getHomeUrl('wordpress')).toBe('https://wordpress.com')
  })

  it('routes rss to the feed tab', () => {
    expect(getHomeUrl('rss')).toBe(feedTabUrl())
  })

  it('falls back to x for unknown platforms', () => {
    expect(getHomeUrl('unknown-platform')).toBe('https://x.com')
  })
})
