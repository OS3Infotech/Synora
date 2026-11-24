import { describe, expect, it, mock } from 'bun:test'
import { onReceiveAuthUrl, parseAuthCallbackParams } from './auth'
import { supabaseAuth } from './client'

describe('parseAuthCallbackParams', () => {
  it('extracts PKCE code from standard query parameter', () => {
    const res = parseAuthCallbackParams('nora://auth?code=pkce-code-1234')
    expect(res.code).toBe('pkce-code-1234')
    expect(res.token).toBeNull()
    expect(res.error).toBeNull()
  })

  it('extracts PKCE code from hash fragment fallback', () => {
    const res = parseAuthCallbackParams('nora://auth#code=pkce-hash-5678')
    expect(res.code).toBe('pkce-hash-5678')
    expect(res.token).toBeNull()
    expect(res.error).toBeNull()
  })

  it('extracts email OTP token from query parameter', () => {
    const res = parseAuthCallbackParams('nora:auth?t=email-otp-token')
    expect(res.token).toBe('email-otp-token')
    expect(res.code).toBeNull()
    expect(res.error).toBeNull()
  })

  it('extracts OAuth error and error_description', () => {
    const res = parseAuthCallbackParams('nora://auth?error=access_denied&error_description=User+cancelled+flow')
    expect(res.error).toBe('access_denied')
    expect(res.errorDescription).toBe('User cancelled flow')
    expect(res.code).toBeNull()
  })

  it('handles empty or unrecognized URLs gracefully', () => {
    const res = parseAuthCallbackParams('nora://auth')
    expect(res.code).toBeNull()
    expect(res.token).toBeNull()
    expect(res.error).toBeNull()
    expect(res.errorDescription).toBeNull()
  })
})

describe('onReceiveAuthUrl', () => {
  it('calls exchangeCodeForSession when authorization code is present', async () => {
    let passedCode: string | null = null
    const originalExchange = supabaseAuth.exchangeCodeForSession
    supabaseAuth.exchangeCodeForSession = (async (code: string) => {
      passedCode = code
      return { data: { session: { user: { id: 'user-123' } } } as any, error: null }
    }) as any

    try {
      const res = await onReceiveAuthUrl('nora://auth?code=my-auth-code')
      expect(passedCode).toBe('my-auth-code')
      expect(res?.session?.user?.id).toBe('user-123')
    } finally {
      supabaseAuth.exchangeCodeForSession = originalExchange
    }
  })

  it('calls verifyOtp when email token is present', async () => {
    let passedToken: string | null = null
    const originalVerifyOtp = supabaseAuth.verifyOtp
    supabaseAuth.verifyOtp = (async (params: any) => {
      passedToken = params.token_hash
      return { data: { session: { user: { id: 'otp-user' } } } as any, error: null }
    }) as any

    try {
      const res = await onReceiveAuthUrl('nora:auth?t=my-otp-token')
      expect(passedToken).toBe('my-otp-token')
      expect(res?.data?.session?.user?.id).toBe('otp-user')
    } finally {
      supabaseAuth.verifyOtp = originalVerifyOtp
    }
  })

  it('throws and redacts authorization code when OAuth error occurs', async () => {
    let thrownError: Error | null = null
    try {
      await onReceiveAuthUrl('nora://auth?error=access_denied&error_description=Authentication+cancelled')
    } catch (err: any) {
      thrownError = err
    }

    expect(thrownError).not.toBeNull()
    expect(thrownError?.message).toBe('Authentication cancelled')
  })
})
