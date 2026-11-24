// OAuth popup and URL classification helpers for desktop

/**
 * Determines whether a hostname belongs to a Google account/auth endpoint.
 * Supports accounts.google.com and all regional ccTLDs (e.g. accounts.google.co.in, accounts.google.co.uk, accounts.google.co.jp, etc.).
 */
export function isGoogleAuthHost(host: string): boolean {
  const lower = host.toLowerCase()
  return (
    lower === 'accounts.google.com' ||
    lower.startsWith('accounts.google.') ||
    lower === 'accounts.youtube.com' ||
    lower.startsWith('accounts.youtube.')
  )
}

export function isGoogleAuthUrl(url: string): boolean {
  try {
    const { host } = new URL(url)
    return isGoogleAuthHost(host)
  } catch {
    return false
  }
}

/**
 * Checks whether a URL is an OAuth authentication flow (Google Sign-In, LinkedIn OAuth, X/Twitter login flow)
 * or a transient placeholder popup (`about:blank`) initialized by client-side OAuth libraries.
 */
export function isOAuthPopupUrl(url: string, _sourceUrl?: string): boolean {
  if (!url || url === 'about:blank' || url.startsWith('about:')) {
    return true
  }

  try {
    const parsed = new URL(url)
    const host = parsed.host.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    const search = parsed.search.toLowerCase()

    if (isGoogleAuthHost(host)) {
      return true
    }

    if (host === 'appleid.apple.com') {
      return true
    }

    // Facebook / Meta login and OAuth flows (including "Log in with Facebook" on Instagram)
    if (host.includes('facebook.com') || host.includes('fb.com')) {
      if (
        path.includes('/dialog/oauth') ||
        path.includes('/login') ||
        path.includes('/oauth') ||
        path.includes('/plugins/login') ||
        search.includes('client_id') ||
        search.includes('redirect_uri')
      ) {
        return true
      }
    }

    // Instagram OAuth and account sign-in popup flows
    if (host.includes('instagram.com')) {
      if (
        path.includes('/accounts/login') ||
        path.includes('/accounts/emailsignup') ||
        path.includes('/oauth') ||
        path.includes('/login') ||
        search.includes('client_id')
      ) {
        return true
      }
    }

    // LinkedIn Google and OAuth popup flows
    if (host.includes('linkedin.com')) {
      if (
        path.includes('connect/google') ||
        path.includes('/uas/oauth') ||
        path.includes('/checkpoint/oauth') ||
        path.includes('/oauth') ||
        search.includes('google')
      ) {
        return true
      }
    }

    // X (Twitter) Google and OAuth login flows
    if (host.includes('x.com') || host.includes('twitter.com')) {
      if (
        path.includes('/i/flow/login') ||
        path.includes('/i/flow/signup') ||
        path.includes('/i/oauth') ||
        path.includes('/oauth') ||
        search.includes('google')
      ) {
        return true
      }
    }

    // Microsoft, GitHub, Discord OAuth login flows
    if (
      host === 'login.microsoftonline.com' ||
      host === 'login.live.com' ||
      (host === 'github.com' && path.includes('/login/oauth')) ||
      (host.includes('discord.com') && path.includes('/oauth2'))
    ) {
      return true
    }

    // General OAuth 2.0 / OpenID Connect authorization popups
    if (
      (search.includes('client_id=') && (search.includes('redirect_uri=') || search.includes('response_type='))) ||
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

