import * as WebBrowser from 'expo-web-browser'
import NoraViewModule from '@/modules/nora-view'
import { fetchWebAuthLink } from '@/lib/query'
import { settings$ } from '@/states/settings'
import { isWeb } from '@/lib/utils'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { supabaseAuth } from './client'

const DELETE_ACCOUNT_URL = 'https://nora.inks.page/auth/app/delete-account'

export const signOut = async () => {
  await supabaseAuth.signOut({ scope: 'local' })
  const profiles = settings$.profiles.peek()
  await Promise.all(profiles.map((p) => NoraViewModule.clearProfileData(p.id)))
}

export const openDeleteAccount = async (accessToken: string) => {
  const { token } = await fetchWebAuthLink(accessToken)
  const url = token ? `${DELETE_ACCOUNT_URL}?t=${encodeURIComponent(token)}` : DELETE_ACCOUNT_URL
  await WebBrowser.openBrowserAsync(url)
}

export interface ParsedAuthCallbackParams {
  code: string | null
  token: string | null
  error: string | null
  errorDescription: string | null
}

export function parseAuthCallbackParams(rawUrl: string): ParsedAuthCallbackParams {
  let search = ''
  let hash = ''

  const qIndex = rawUrl.indexOf('?')
  const hIndex = rawUrl.indexOf('#')

  if (qIndex !== -1) {
    search = hIndex !== -1 && hIndex > qIndex ? rawUrl.slice(qIndex + 1, hIndex) : rawUrl.slice(qIndex + 1)
  }
  if (hIndex !== -1) {
    hash = rawUrl.slice(hIndex + 1)
  }

  const queryParams = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash)

  const code = queryParams.get('code') || hashParams.get('code')
  const token = queryParams.get('t') || hashParams.get('t')
  const error = queryParams.get('error') || hashParams.get('error')
  const errorDescription = queryParams.get('error_description') || hashParams.get('error_description')

  return { code, token, error, errorDescription }
}

export const onReceiveAuthUrl = async (url: string) => {
  const { code, token, error, errorDescription } = parseAuthCallbackParams(url)

  if (error) {
    try {
      await WebBrowser.dismissBrowser()
    } catch {
      // ignore
    }
    console.warn('[Auth] OAuth error callback received:', error, errorDescription || '')
    throw new Error(errorDescription || error)
  }

  if (code) {
    try {
      await WebBrowser.dismissBrowser()
    } catch {
      // ignore
    }

    const { data, error: exchangeError } = await supabaseAuth.exchangeCodeForSession(code)
    if (exchangeError) {
      console.error('[Auth] Failed to exchange code for session:', exchangeError.message)
      throw exchangeError
    }
    return data
  }

  if (token) {
    try {
      await WebBrowser.dismissBrowser()
    } catch {
      // ignore
    }

    try {
      // https://github.com/orgs/supabase/discussions/27181#discussioncomment-10986267
      return await supabaseAuth.verifyOtp({
        token_hash: token,
        type: 'email',
      })
    } catch (err) {
      console.error('verifyOtp failed', err)
      throw err
    }
  }
}

export const signInWithGoogle = async () => {
  const isElectron = isWeb && typeof window !== 'undefined' && Boolean((window as any).electron)

  if (isElectron) {
    // Desktop Electron loopback flow
    const { authId, redirectUrl } = await mainClient.startDesktopAuth()
    try {
      // Supabase generates and manages PKCE code challenge and verifier in its own client storage
      const { data, error } = await supabaseAuth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      })

      if (error) {
        await mainClient.cancelDesktopAuth(authId).catch(() => {})
        throw error
      }
      if (!data?.url) {
        await mainClient.cancelDesktopAuth(authId).catch(() => {})
        throw new Error('No authorization URL returned by authentication provider')
      }

      // Open OAuth authorization URL in the system's default browser
      await mainClient.openExternalAuthUrl(authId, data.url)

      // Wait for loopback server to receive the authorization code
      const { code } = await mainClient.waitForDesktopAuthCode(authId)

      // Complete PKCE code exchange using the same Supabase client instance
      const { data: sessionData, error: sessionError } = await supabaseAuth.exchangeCodeForSession(code)
      if (sessionError) {
        throw sessionError
      }
      return sessionData
    } catch (err) {
      await mainClient.cancelDesktopAuth(authId).catch(() => {})
      throw err
    }
  } else if (!isWeb) {
    // Native mobile flow (Android / iOS)
    const redirectTo = 'nora://auth'
    const { data, error } = await supabaseAuth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })

    if (error) {
      throw error
    }
    if (!data?.url) {
      throw new Error('No authorization URL returned by authentication provider')
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
    if (result.type === 'success' && result.url) {
      return await onReceiveAuthUrl(result.url)
    } else if (result.type === 'cancel' || result.type === 'dismiss') {
      return null
    }
  } else {
    // Standard web browser fallback
    return await supabaseAuth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })
  }
}
