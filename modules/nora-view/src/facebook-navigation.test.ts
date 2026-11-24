import { describe, expect, it } from 'bun:test'

/**
 * Pure TypeScript mirror of the Android (Kotlin) & iOS (Swift) logic in NoraView
 * to verify navigation rewriting rules, OAuth popup matching, and logging sanitization.
 */

function isFacebookAuthOrSecurityUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (!host.endsWith('facebook.com') && host !== 'fb.com') {
      return false
    }
    const path = parsed.pathname.toLowerCase()
    const query = parsed.search.toLowerCase()

    if (path === '/login' || path.startsWith('/login/') || path === '/login.php') {
      return true
    }
    if (path.includes('/dialog/oauth') || path === '/oauth' || path.startsWith('/oauth/')) {
      return true
    }
    if (query.includes('client_id') || (query.includes('redirect_uri') && query.includes('response_type'))) {
      return true
    }
    if (path === '/checkpoint' || path.startsWith('/checkpoint/')) {
      return true
    }
    if (path.includes('two_step_verification') || path.includes('two_factor') || path.includes('/2fa')) {
      return true
    }
    if (
      path === '/security' || path.startsWith('/security/') ||
      path === '/recover' || path.startsWith('/recover/') ||
      path === '/auth' || path.startsWith('/auth/') ||
      path === '/identity' || path.startsWith('/identity/')
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

function isMessengerUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    return (host === 'www.facebook.com' || host === 'm.facebook.com') && (path === '/messages' || path.startsWith('/messages/'))
  } catch {
    return false
  }
}

function isMarketplaceUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    return (host === 'www.facebook.com' || host === 'm.facebook.com') && (path === '/marketplace' || path.startsWith('/marketplace/'))
  } catch {
    return false
  }
}

function isDesktopFacebookUrl(url: string): boolean {
  return isMessengerUrl(url) || isMarketplaceUrl(url)
}

function shouldRedirectFacebookToMobile(currentUrl: string, targetUrl: string, desktopMode: boolean): boolean {
  if (desktopMode) {
    return false
  }
  if (!targetUrl.startsWith('https://www.facebook.com/')) {
    return false
  }
  if (isDesktopFacebookUrl(targetUrl)) {
    return false
  }
  if (isMessengerUrl(currentUrl)) {
    return false
  }
  if (isFacebookAuthOrSecurityUrl(targetUrl) || isFacebookAuthOrSecurityUrl(currentUrl)) {
    return false
  }
  return true
}

function isGoogleOAuthPopupUrl(url: string): boolean {
  if (!url || url === 'about:blank' || url.startsWith('about:')) {
    return true
  }
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    const query = parsed.search.toLowerCase()

    if (
      host === 'accounts.google.com' ||
      host.startsWith('accounts.google.') ||
      host === 'accounts.youtube.com' ||
      host.startsWith('accounts.youtube.')
    ) {
      return true
    }
    if (host.includes('linkedin.com') && (path.includes('connect/google') || path.includes('oauth') || query.includes('google'))) {
      return true
    }
    if ((host.includes('twitter.com') || host.includes('x.com')) && (path.includes('/i/flow') || path.includes('oauth') || query.includes('google'))) {
      return true
    }
    if (host === 'appleid.apple.com') {
      return true
    }
    if (host.endsWith('facebook.com') || host === 'facebook.com' || host.endsWith('fb.com') || host === 'fb.com') {
      if (
        path.includes('/dialog/oauth') ||
        path.includes('/login') ||
        path.includes('/oauth') ||
        path.includes('/plugins/login') ||
        path.includes('/checkpoint') ||
        path.includes('two_step_verification') ||
        path.includes('two_factor') ||
        query.includes('client_id') ||
        query.includes('redirect_uri') ||
        query.includes('app_id')
      ) {
        return true
      }
    }
    if (host.endsWith('instagram.com') || host === 'instagram.com') {
      if (
        path.includes('/accounts/login') ||
        path.includes('/accounts/emailsignup') ||
        path.includes('/oauth') ||
        path.includes('/login') ||
        query.includes('client_id') ||
        query.includes('redirect_uri')
      ) {
        return true
      }
    }
    if (
      (query.includes('client_id=') && (query.includes('redirect_uri=') || query.includes('response_type='))) ||
      path.includes('/oauth/authorize') ||
      path.includes('/oauth2/authorize')
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

function sanitizeUrlForLogging(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    for (const [key, value] of Array.from(parsed.searchParams.entries())) {
      const lower = key.toLowerCase()
      if (
        lower.includes('pass') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('code') ||
        lower.includes('cookie') ||
        lower.includes('auth') ||
        lower.includes('credential') ||
        lower.includes('state') ||
        lower.includes('ticket') ||
        lower.includes('session') ||
        lower.includes('key')
      ) {
        parsed.searchParams.set(key, '[REDACTED]')
      }
    }
    return parsed.toString()
  } catch {
    return '[malformed-url]'
  }
}

describe('Facebook navigation & auth route protection', () => {
  it('correctly detects Facebook auth, checkpoint, and 2FA routes', () => {
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/login.php')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/login/device-based/regular/login/')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/dialog/oauth?client_id=123')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/v19.0/dialog/oauth?client_id=123')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/checkpoint/')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/checkpoint/1501092823525282/')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/two_step_verification/two_factor/')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/security/2fa/')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/recover/initiate/')).toBe(true)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/auth/2fa/')).toBe(true)

    // Ordinary browsing routes return false
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/')).toBe(false)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/zuck')).toBe(false)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/groups/123/')).toBe(false)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/marketplace/item/1/')).toBe(false)
    expect(isFacebookAuthOrSecurityUrl('https://www.facebook.com/messages/t/1/')).toBe(false)
  })

  it('never redirects login, OAuth, checkpoint or security routes to mobile', () => {
    // Target is login
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/login.php', false)).toBe(false)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/login/', false)).toBe(false)

    // Target is OAuth dialog
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/dialog/oauth?client_id=123&redirect_uri=https://example.com', false)).toBe(false)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/v18.0/dialog/oauth?client_id=123', false)).toBe(false)

    // Target is checkpoint or 2FA
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/checkpoint/', false)).toBe(false)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/two_step_verification/two_factor/', false)).toBe(false)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/security/2fa/', false)).toBe(false)

    // Current page is checkpoint or login -> sub-actions should not be redirected
    expect(shouldRedirectFacebookToMobile('https://www.facebook.com/checkpoint/', 'https://www.facebook.com/security/', false)).toBe(false)

    // Desktop mode is enabled
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/', true)).toBe(false)

    // Messenger & Marketplace desktop pages stay desktop
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/marketplace/item/123/', false)).toBe(false)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/messages/', false)).toBe(false)

    // Ordinary browsing continues to be redirected to mobile
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/', false)).toBe(true)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/zuck', false)).toBe(true)
    expect(shouldRedirectFacebookToMobile('https://m.facebook.com/', 'https://www.facebook.com/groups/123', false)).toBe(true)
  })
})

describe('OAuth popup detection across platforms', () => {
  it('correctly handles Facebook OAuth popups without dropping or converting to new tabs', () => {
    expect(isGoogleOAuthPopupUrl('https://www.facebook.com/dialog/oauth?client_id=123&redirect_uri=https%3A%2F%2Finstagram.com')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://www.facebook.com/v18.0/dialog/oauth?client_id=123')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://m.facebook.com/login.php?skip_api_login=1&api_key=123')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://www.facebook.com/checkpoint/?next=xyz')).toBe(true)
  })

  it('preserves existing platform popup support for Instagram, Google, LinkedIn, X, Apple', () => {
    expect(isGoogleOAuthPopupUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=xyz')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://accounts.google.co.uk/o/oauth2/auth')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://www.instagram.com/accounts/login/?next=/oauth/')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://www.linkedin.com/uas/connect/google?session_redirect=https%3A%2F%2Flinkedin.com')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://x.com/i/flow/login')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://appleid.apple.com/auth/authorize')).toBe(true)
    expect(isGoogleOAuthPopupUrl('https://auth.provider.com/oauth2/authorize?client_id=1&redirect_uri=https://app.com&response_type=code')).toBe(true)
  })

  it('does NOT classify regular browsing as OAuth popups', () => {
    expect(isGoogleOAuthPopupUrl('https://www.facebook.com/')).toBe(false)
    expect(isGoogleOAuthPopupUrl('https://m.facebook.com/feed')).toBe(false)
    expect(isGoogleOAuthPopupUrl('https://www.google.com/search?q=synora')).toBe(false)
    expect(isGoogleOAuthPopupUrl('https://www.linkedin.com/feed/')).toBe(false)
    expect(isGoogleOAuthPopupUrl('https://x.com/home')).toBe(false)
  })
})

describe('Authentication diagnostics logging sanitization', () => {
  it('redacts tokens, passwords, authorization codes, secrets, and keys', () => {
    const rawUrl = 'https://www.facebook.com/dialog/oauth?client_id=123456&code=AQD123xyzSecret&state=secureState987&access_token=EAAB123Token'
    const sanitized = sanitizeUrlForLogging(rawUrl)
    expect(sanitized).toContain('client_id=123456')
    expect(sanitized).toContain('code=%5BREDACTED%5D')
    expect(sanitized).toContain('state=%5BREDACTED%5D')
    expect(sanitized).toContain('access_token=%5BREDACTED%5D')
    expect(sanitized).not.toContain('AQD123xyzSecret')
    expect(sanitized).not.toContain('secureState987')
    expect(sanitized).not.toContain('EAAB123Token')
  })

  it('redacts credentials and passwords in query strings', () => {
    const rawUrl = 'https://example.com/login?username=user1&password=mysecretpassword123&session_ticket=abc'
    const sanitized = sanitizeUrlForLogging(rawUrl)
    expect(sanitized).toContain('username=user1')
    expect(sanitized).not.toContain('mysecretpassword123')
    expect(sanitized).not.toContain('abc')
    expect(sanitized).toContain('password=%5BREDACTED%5D')
    expect(sanitized).toContain('session_ticket=%5BREDACTED%5D')
  })

  it('handles empty or malformed URLs safely', () => {
    expect(sanitizeUrlForLogging('')).toBe('')
    expect(sanitizeUrlForLogging(null)).toBe('')
    expect(sanitizeUrlForLogging('not a url')).toBe('[malformed-url]')
  })
})
