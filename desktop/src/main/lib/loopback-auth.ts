import http from 'node:http'
import crypto from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { shell } from 'electron'

interface ActiveAuth {
  authId: string
  server: http.Server
  port: number
  timer: NodeJS.Timeout
  resolve: (value: { code: string }) => void
  reject: (reason: Error) => void
  promise: Promise<{ code: string }>
  completed: boolean
}

let currentAuth: ActiveAuth | null = null

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Synora Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #09090b;
      color: #fafafa;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 1.25rem;
      border-radius: 50%;
      background: #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
    }
    p {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <h1>Authentication Successful</h1>
    <p>You have signed in to Synora. You may now close this browser tab and return to the app.</p>
  </div>
</body>
</html>`
}

function renderErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Synora Authentication Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #09090b;
      color: #fafafa;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 52px;
      height: 52px;
      margin: 0 auto 1.25rem;
      border-radius: 50%;
      background: #ef4444;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
    }
    p {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </div>
    <h1>Authentication Failed</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
}

function renderHashFallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Synora Authentication</title>
  <script>
    if (window.location.hash) {
      var params = new URLSearchParams(window.location.hash.substring(1));
      if (params.get('code') || params.get('error')) {
        window.location.replace('/callback?' + params.toString());
      } else {
        document.getElementById('status').innerText = 'Missing authorization parameters';
      }
    } else {
      document.getElementById('status').innerText = 'Missing authorization code';
    }
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #09090b;
      color: #fafafa;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      padding: 2.5rem;
      max-width: 420px;
      text-align: center;
    }
    p { color: #a1a1aa; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <p id="status">Verifying authentication...</p>
  </div>
</body>
</html>`
}

function cleanupAuth(auth: ActiveAuth, rejectionError?: Error) {
  clearTimeout(auth.timer)
  if (rejectionError && !auth.completed) {
    auth.completed = true
    auth.reject(rejectionError)
  }
  try {
    auth.server.close()
  } catch {
    // ignore
  }
  if (currentAuth === auth) {
    currentAuth = null
  }
}

export function createLoopbackServer(
  onCallback: (code: string | null, error: string | null, errorDescription: string | null) => {
    handled: boolean
    body: string
    statusCode: number
  },
  onListening?: (port: number) => void,
  preferredPort?: number,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    let port = 0
    const server = http.createServer((req, res) => {
      // 1. Only GET method allowed
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' })
        res.end('Method Not Allowed')
        return
      }

      // 2. Validate remote address is strictly 127.0.0.1
      const remote = req.socket.remoteAddress
      if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1') {
        console.warn('[Auth] Rejected loopback connection from unauthorized remote address')
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden')
        req.socket.destroy()
        return
      }

      // 3. Validate Host header
      const host = (req.headers.host || '').toLowerCase()
      const allowedHosts = new Set([
        `127.0.0.1:${port}`,
        `localhost:${port}`,
        '127.0.0.1',
        'localhost',
      ])
      if (!allowedHosts.has(host)) {
        console.warn('[Auth] Rejected loopback connection with invalid Host header:', host)
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Forbidden')
        return
      }

      // 4. Validate Path
      let reqUrl: URL
      try {
        reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`)
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
        return
      }

      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
        return
      }

      // 5. Query parameters extraction (never log authorization code or token)
      const code = reqUrl.searchParams.get('code')
      const error = reqUrl.searchParams.get('error')
      const errorDescription = reqUrl.searchParams.get('error_description')

      if (!code && !error) {
        // Fallback for hash fragments if any
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';",
        })
        res.end(renderHashFallbackHtml())
        return
      }

      const result = onCallback(code, error, errorDescription)
      res.writeHead(result.statusCode, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline';",
      })
      res.end(result.body)
    })

    const tryListen = (listenPort: number) => {
      server.listen(listenPort, '127.0.0.1', () => {
        const address = server.address() as AddressInfo
        port = address.port
        if (onListening) onListening(port)
        resolve({ server, port })
      })
    }

    server.once('error', (err: any) => {
      if (preferredPort && preferredPort !== 0 && err.code === 'EADDRINUSE') {
        // Fallback to ephemeral port 0 if preferred port is occupied
        tryListen(0)
      } else {
        reject(err)
      }
    })

    tryListen(preferredPort || 0)
  })
}

export async function startDesktopAuth(preferredPort?: number): Promise<{ authId: string; redirectUrl: string }> {
  if (currentAuth) {
    cleanupAuth(currentAuth, new Error('Authentication replaced by new request'))
  }

  const authId = crypto.randomUUID()
  let resolvePromise!: (value: { code: string }) => void
  let rejectPromise!: (reason: Error) => void
  const promise = new Promise<{ code: string }>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  let activeAuth: ActiveAuth

  const { server, port } = await createLoopbackServer(
    (code, error, errorDescription) => {
      if (error) {
        console.warn('[Auth] OAuth error received:', error, errorDescription ? `(${errorDescription})` : '')
        if (!activeAuth.completed) {
          activeAuth.completed = true
          activeAuth.reject(new Error(errorDescription || error))
          setTimeout(() => cleanupAuth(activeAuth), 500)
        }
        return {
          handled: true,
          statusCode: 400,
          body: renderErrorHtml(errorDescription || error),
        }
      }

      if (code) {
        if (activeAuth.completed) {
          return {
            handled: false,
            statusCode: 409,
            body: renderErrorHtml('Authentication callback has already been processed.'),
          }
        }
        activeAuth.completed = true
        activeAuth.resolve({ code })
        setTimeout(() => cleanupAuth(activeAuth), 500)
        return {
          handled: true,
          statusCode: 200,
          body: renderSuccessHtml(),
        }
      }

      return {
        handled: false,
        statusCode: 400,
        body: renderErrorHtml('Missing authorization parameters'),
      }
    },
    undefined,
    preferredPort,
  )

  const timer = setTimeout(() => {
    console.warn('[Auth] Desktop authentication timed out after 120 seconds')
    if (currentAuth === activeAuth && !activeAuth.completed) {
      cleanupAuth(activeAuth, new Error('Authentication timed out after 120 seconds'))
    }
  }, 120_000)

  activeAuth = {
    authId,
    server,
    port,
    timer,
    resolve: resolvePromise,
    reject: rejectPromise,
    promise,
    completed: false,
  }

  currentAuth = activeAuth
  return {
    authId,
    redirectUrl: `http://127.0.0.1:${port}/callback`,
  }
}

export async function openExternalAuthUrl(authId: string, url: string): Promise<void> {
  if (!currentAuth || currentAuth.authId !== authId) {
    throw new Error('No active authentication session')
  }

  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('OAuth authorization URL must use HTTPS protocol')
  }

  await shell.openExternal(url)
}

export function waitForDesktopAuthCode(authId: string): Promise<{ code: string }> {
  if (!currentAuth || currentAuth.authId !== authId) {
    return Promise.reject(new Error('No active authentication session'))
  }
  return currentAuth.promise
}

export function cancelDesktopAuth(authId?: string): Promise<void> {
  if (currentAuth && (!authId || currentAuth.authId === authId)) {
    cleanupAuth(currentAuth, new Error('Authentication cancelled'))
  }
  return Promise.resolve()
}

