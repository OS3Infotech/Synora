import { describe, expect, it, mock } from 'bun:test'
import http from 'node:http'

mock.module('electron', () => ({
  shell: {
    openExternal: async () => {},
  },
}))

const { createLoopbackServer } = await import('./loopback-auth')

function request(url: string, options: http.RequestOptions = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: data,
          headers: res.headers,
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

describe('LoopbackAuthServer', () => {
  it('binds exclusively to 127.0.0.1 on an available port', async () => {
    const { server, port } = await createLoopbackServer(() => ({
      handled: true,
      statusCode: 200,
      body: 'OK',
    }))

    try {
      expect(port).toBeGreaterThan(0)
      const address = server.address() as any
      expect(address.address).toBe('127.0.0.1')
    } finally {
      server.close()
    }
  })

  it('rejects non-GET HTTP methods with 405 Method Not Allowed', async () => {
    const { server, port } = await createLoopbackServer(() => ({
      handled: true,
      statusCode: 200,
      body: 'OK',
    }))

    try {
      const res = await request(`http://127.0.0.1:${port}/callback?code=abc`, { method: 'POST' })
      expect(res.status).toBe(405)
      expect(res.body).toContain('Method Not Allowed')
    } finally {
      server.close()
    }
  })

  it('rejects requests with invalid Host header with 403 Forbidden', async () => {
    const { server, port } = await createLoopbackServer(() => ({
      handled: true,
      statusCode: 200,
      body: 'OK',
    }))

    try {
      const res = await request(`http://127.0.0.1:${port}/callback?code=abc`, {
        headers: { Host: 'attacker.example.com' },
      })
      expect(res.status).toBe(403)
      expect(res.body).toContain('Forbidden')
    } finally {
      server.close()
    }
  })

  it('rejects non-/callback paths with 404 Not Found', async () => {
    const { server, port } = await createLoopbackServer(() => ({
      handled: true,
      statusCode: 200,
      body: 'OK',
    }))

    try {
      const res = await request(`http://127.0.0.1:${port}/other-path`)
      expect(res.status).toBe(404)
      expect(res.body).toContain('Not Found')
    } finally {
      server.close()
    }
  })

  it('handles valid authorization code callback successfully', async () => {
    let capturedCode: string | null = null

    const { server, port } = await createLoopbackServer((code) => {
      capturedCode = code
      return {
        handled: true,
        statusCode: 200,
        body: '<h1>Authentication Successful</h1>',
      }
    })

    try {
      const res = await request(`http://127.0.0.1:${port}/callback?code=auth-code-12345`)
      expect(res.status).toBe(200)
      expect(capturedCode).toBe('auth-code-12345')
      expect(res.body).toContain('Authentication Successful')
    } finally {
      server.close()
    }
  })

  it('handles OAuth error response correctly', async () => {
    let capturedError: string | null = null
    let capturedDesc: string | null = null

    const { server, port } = await createLoopbackServer((_code, error, errorDesc) => {
      capturedError = error
      capturedDesc = errorDesc
      return {
        handled: true,
        statusCode: 400,
        body: '<h1>Authentication Failed</h1>',
      }
    })

    try {
      const res = await request(`http://127.0.0.1:${port}/callback?error=access_denied&error_description=User+cancelled`)
      expect(res.status).toBe(400)
      expect(capturedError).toBe('access_denied')
      expect(capturedDesc).toBe('User cancelled')
      expect(res.body).toContain('Authentication Failed')
    } finally {
      server.close()
    }
  })

  it('returns fallback HTML when neither code nor error is in query (for hash fragments)', async () => {
    const { server, port } = await createLoopbackServer(() => ({
      handled: true,
      statusCode: 200,
      body: 'OK',
    }))

    try {
      const res = await request(`http://127.0.0.1:${port}/callback`)
      expect(res.status).toBe(200)
      expect(res.body).toContain('window.location.hash')
    } finally {
      server.close()
    }
  })
})
