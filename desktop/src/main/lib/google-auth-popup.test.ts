import { describe, expect, it, mock } from 'bun:test'

mock.module('electron', () => ({
  BrowserWindow: class {},
  session: { fromPartition: () => ({}) },
}))
mock.module('../ipc/ui', () => ({
  uiClient: { handleDeeplink: () => {} },
}))

const { isGoogleAuthUrl, isOAuthPopupUrl } = await import('./google-auth-popup')

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

  it('matches accounts.google.co.jp (Japan locale)', () => {
    expect(isGoogleAuthUrl('https://accounts.google.co.jp/o/oauth2/v2/auth')).toBe(true)
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

describe('isOAuthPopupUrl', () => {
  it('matches transient about:blank popup placeholders', () => {
    expect(isOAuthPopupUrl('about:blank')).toBe(true)
    expect(isOAuthPopupUrl('')).toBe(true)
  })

  it('matches Google OAuth URLs', () => {
    expect(isOAuthPopupUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=123')).toBe(true)
  })

  it('matches LinkedIn Google / OAuth connect endpoints', () => {
    expect(isOAuthPopupUrl('https://www.linkedin.com/uas/connect/google?session_redirect=https%3A%2F%2Fwww.linkedin.com')).toBe(true)
    expect(isOAuthPopupUrl('https://www.linkedin.com/checkpoint/oauth/login')).toBe(true)
  })

  it('matches X (Twitter) login / OAuth flows', () => {
    expect(isOAuthPopupUrl('https://x.com/i/flow/login?input_flow_data=xyz')).toBe(true)
    expect(isOAuthPopupUrl('https://twitter.com/i/flow/signup')).toBe(true)
  })

  it('matches Facebook / Meta OAuth and login dialogs', () => {
    expect(isOAuthPopupUrl('https://www.facebook.com/v12.0/dialog/oauth?client_id=123&redirect_uri=https://instagram.com')).toBe(true)
    expect(isOAuthPopupUrl('https://m.facebook.com/login.php?skip_api_login=1&api_key=123')).toBe(true)
  })

  it('matches Instagram login and OAuth popups', () => {
    expect(isOAuthPopupUrl('https://www.instagram.com/accounts/login/?next=/oauth/')).toBe(true)
    expect(isOAuthPopupUrl('https://api.instagram.com/oauth/authorize?client_id=abc&redirect_uri=xyz')).toBe(true)
  })

  it('matches general OAuth 2.0 authorization endpoints', () => {
    expect(isOAuthPopupUrl('https://auth.example.com/oauth2/authorize?client_id=app1&redirect_uri=https://app.com&response_type=code')).toBe(true)
    expect(isOAuthPopupUrl('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')).toBe(true)
  })

  it('does NOT match standard browsing URLs', () => {
    expect(isOAuthPopupUrl('https://www.linkedin.com/feed/')).toBe(false)
    expect(isOAuthPopupUrl('https://x.com/home')).toBe(false)
    expect(isOAuthPopupUrl('https://www.google.com/search?q=test')).toBe(false)
  })
})

