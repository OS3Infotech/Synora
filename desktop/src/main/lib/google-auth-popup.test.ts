import { describe, expect, it } from 'bun:test'
import { isGoogleAuthUrl } from './google-auth-popup'

describe('isGoogleAuthUrl', () => {
  it('matches accounts.google.com (main Google OAuth host)', () => {
    expect(isGoogleAuthUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=xyz')).toBe(true)
  })

  it('matches accounts.google.co.in (India locale)', () => {
    expect(isGoogleAuthUrl('https://accounts.google.co.in/o/oauth2/v2/auth')).toBe(true)
  })

  it('matches accounts.google.co.uk (UK locale)', () => {
    expect(isGoogleAuthUrl('https://accounts.google.co.uk/o/oauth2/v2/auth')).toBe(true)
  })

  it('does NOT match www.google.com (Google search)', () => {
    expect(isGoogleAuthUrl('https://www.google.com/search?q=linkedin')).toBe(false)
  })

  it('does NOT match gstatic.com (Google CDN)', () => {
    expect(isGoogleAuthUrl('https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js')).toBe(false)
  })

  it('does NOT match linkedin.com', () => {
    expect(isGoogleAuthUrl('https://www.linkedin.com')).toBe(false)
  })

  it('handles malformed URLs safely', () => {
    expect(isGoogleAuthUrl('not a url')).toBe(false)
  })
})

