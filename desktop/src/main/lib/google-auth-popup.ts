import { BrowserWindow, Session, session } from 'electron'
import { mainWindow } from './main-window'
import { uiClient } from 'main/ipc/ui'

/**
 * Hosts that serve Google OAuth consent / login flows.
 */
const GOOGLE_AUTH_HOSTS = new Set([
  'accounts.google.com',
  'accounts.google.co.in',
  'accounts.google.co.uk',
  'accounts.google.com.au',
  'accounts.youtube.com',
])

export function isGoogleAuthUrl(url: string): boolean {
  try {
    const { host } = new URL(url)
    return GOOGLE_AUTH_HOSTS.has(host.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Firefox desktop User-Agent string.
 *
 * Google blocks embedded Chromium/Electron browsers with "This browser or app
 * may not be secure" because it inspects Client Hints (`Sec-CH-UA`) and anomalous
 * Chromium fingerprints. Since Firefox does not use Client Hints or Chromium internals,
 * Google evaluates it via standard web flow and allows the OAuth login.
 */
export const FIREFOX_UA =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
    : process.platform === 'win32'
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'
    : 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'

const configuredSessions = new WeakSet<Session>()

/**
 * Strips Chromium client hints and injects a standard Firefox User-Agent
 * specifically for requests to Google accounts endpoints.
 */
export function setupGoogleAuthSession(ses: Session): void {
  if (configuredSessions.has(ses)) {
    return
  }
  configuredSessions.add(ses)

  const filter = {
    urls: [
      'https://accounts.google.com/*',
      'https://accounts.google.co.in/*',
      'https://accounts.google.co.uk/*',
      'https://accounts.google.com.au/*',
      'https://accounts.youtube.com/*',
    ],
  }

  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (isGoogleAuthUrl(details.url)) {
      delete details.requestHeaders['sec-ch-ua']
      delete details.requestHeaders['sec-ch-ua-mobile']
      delete details.requestHeaders['sec-ch-ua-platform']
      delete details.requestHeaders['sec-ch-ua-platform-version']
      delete details.requestHeaders['sec-ch-ua-model']
      details.requestHeaders['User-Agent'] = FIREFOX_UA
    }
    callback({ requestHeaders: details.requestHeaders })
  })
}

/**
 * Open a temporary child BrowserWindow for Google OAuth if needed directly.
 */
export function openGoogleAuthPopup(url: string, partition: string): BrowserWindow {
  const parent = mainWindow ?? undefined
  const targetSession = session.fromPartition(partition)
  setupGoogleAuthSession(targetSession)

  const popup = new BrowserWindow({
    width: 520,
    height: 680,
    parent,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      session: targetSession,
    },
  })

  popup.webContents.setUserAgent(FIREFOX_UA)

  const dispatchCallback = (callbackUrl: string) => {
    if (!popup.isDestroyed()) {
      popup.close()
    }
    uiClient.handleDeeplink(callbackUrl)
  }

  popup.webContents.on('will-navigate', (_event, navUrl) => {
    if (navUrl.startsWith('nora:')) {
      dispatchCallback(navUrl)
    }
  })

  popup.webContents.on('will-redirect', (_event, navUrl) => {
    if (navUrl.startsWith('nora:')) {
      dispatchCallback(navUrl)
    }
  })

  popup.loadURL(url, { userAgent: FIREFOX_UA })
  return popup
}
