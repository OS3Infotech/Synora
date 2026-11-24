# Synora Authentication Audit Report

This report analyzes the authentication architecture, provider-specific login flows, browser/WebView configurations, and failure mechanisms for **Google**, **Instagram**, **Facebook**, and **LinkedIn** across Synora Desktop (Electron), Android, and iOS.

---

## 1. Architecture Summary

Synora is a multi-platform social web browser and aggregator built with React Native / Expo for mobile and Electron for desktop.

### 1.1 Core Frameworks & Versions
* **React:** `19.3.0`
* **React Native:** `0.88.0` (New Architecture enabled)
* **Expo SDK:** `~58.0.14` (Expo Router `~58.0.23`)
* **Electron:** `43.2.0` (`desktop/package.json`, packaged with `electron-builder 26.1.0` and `electron-vite 4.0.0`)
* **State Management:** `@legendapp/state 3.0.0-beta.47`
* **Backend / Sync Auth:** `@supabase/supabase-js 2.90.1`

### 1.2 Authentication Types in Codebase
1. **Application-Level Auth (Synora Tab Sync):**
   * Uses Supabase OTP / OAuth (`lib/supabase/auth.ts`).
   * Native entry point: `components/link/NouLink.native.tsx` via `expo-web-browser` (`openAuthSessionAsync` redirecting to `nora:auth`).
   * Desktop entry point: `components/link/NouLink.tsx` via OS default browser and protocol handler (`nora://auth?t=[REDACTED]`).
2. **Platform In-Browser Auth (Google, Instagram, Facebook, LinkedIn):**
   * Synora functions as a multi-service client rendering web platforms directly.
   * All platform logins execute inside embedded WebViews or child popup windows; no official third-party platform native SDKs (e.g. Google Sign-In SDK, Facebook SDK) are used.

### 1.3 Browser & WebView Components by Platform
* **Desktop (Linux/macOS/Windows):**
  * Core component: Electron `<webview>` tag rendered via `NoraView.web.tsx` ([`modules/nora-view/src/NoraView.web.tsx`](file:///home/diya/Nora/modules/nora-view/src/NoraView.web.tsx)).
  * Host window: Electron `BrowserWindow` with `nodeIntegrationInSubFrames: true` and custom preloads (`desktop/src/main/index.ts`).
  * Popups: Child `BrowserWindow` instances managed via `setWindowOpenHandler` and `did-create-window`.
* **Android:**
  * Core component: Custom Expo Module `expo.modules.noraview.NouWebView` ([`modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt`](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt)) subclassing `android.webkit.WebView`.
  * Multi-profile storage: Android `androidx.webkit.ProfileStore` / `WebViewFeature.MULTI_PROFILE`.
  * Popups: Embedded overlay `NouWebView` created in `WebChromeClient.onCreateWindow`.
* **iOS:**
  * Core component: Custom Expo Module `NoraView` ([`modules/nora-view/ios/NoraView.swift`](file:///home/diya/Nora/modules/nora-view/ios/NoraView.swift)) wrapping `WebKit.WKWebView`.
  * Multi-profile storage: `WKWebsiteDataStore(forIdentifier:)` on iOS 17.0+.
  * Popups: Overlay `WKWebView` created in `WKUIDelegate.webView(_:createWebViewWith:for:windowFeatures:)`.

---

## 2. Authentication Flow & Implementation per Provider

### 2.1 Google

#### Flow Overview
* Users log in directly via Google accounts (`accounts.google.com`, Gemini, YouTube) or through third-party federated "Sign in with Google" buttons on sites like LinkedIn, X, or Reddit.
* Login relies on embedded WebViews and popup handling.

#### Implementation & Code Snippets

**Desktop (Electron Main):**
* Detection and Session Header Interception in [`desktop/src/main/lib/google-auth-popup.ts`](file:///home/diya/Nora/desktop/src/main/lib/google-auth-popup.ts#L174-L186):
```typescript
ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
  if (isGoogleAuthUrl(details.url)) {
    for (const key of Object.keys(details.requestHeaders)) {
      const lower = key.toLowerCase()
      if (lower.startsWith('sec-ch-ua') || lower === 'user-agent' || lower === 'x-client-data') {
        delete details.requestHeaders[key]
      }
    }
    details.requestHeaders['User-Agent'] = FIREFOX_UA
  }
  callback({ requestHeaders: details.requestHeaders })
})
```
* Popup Handling in [`desktop/src/main/index.ts`](file:///home/diya/Nora/desktop/src/main/index.ts#L243-L257):
```typescript
wc.on('did-create-window', (childWindow) => {
  setupGoogleAuthSession(childWindow.webContents.session)
  childWindow.webContents.on('will-navigate', (_event, targetUrl) => {
    if (isGoogleAuthUrl(targetUrl)) {
      childWindow.webContents.setUserAgent(FIREFOX_UA)
    }
    // ...
  })
})
```

**Mobile (Android & iOS WebViews):**
* In [`modules/nora-view/android/.../NoraView.kt`](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L309-L328) and [`modules/nora-view/ios/NoraViewModule.swift`](file:///home/diya/Nora/modules/nora-view/ios/NoraViewModule.swift#L40-L55), a client-side JavaScript shim is injected at document start to mask WebView properties:
```javascript
(function() {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; }, configurable: true });
  } catch (e) {}
  try {
    if (!window.chrome) { window.chrome = {}; }
    if (!window.chrome.runtime) { window.chrome.runtime = {}; }
    if (!window.chrome.app) { window.chrome.app = { isInstalled: false }; }
    if (!window.chrome.csi) { window.chrome.csi = function() { return {}; }; }
    if (!window.chrome.loadTimes) { window.chrome.loadTimes = function() { return {}; }; }
  } catch (e) {}
})();
```

---

### 2.2 Instagram

#### Flow Overview
* Entry point: `https://www.instagram.com` ([`lib/page.ts`](file:///home/diya/Nora/lib/page.ts#L18)).
* Users authenticate via username/password or "Log in with Facebook" (OAuth dialog on `facebook.com`).
* Authenticated status is verified via the `sessionid` cookie ([`lib/watch-account.ts`](file:///home/diya/Nora/lib/watch-account.ts#L27)).

#### Implementation & Popup Handling
* **Desktop:** `isOAuthPopupUrl` ([`desktop/src/main/lib/google-auth-popup.ts`](file:///home/diya/Nora/desktop/src/main/lib/google-auth-popup.ts#L65-L76)) permits popups for `instagram.com` (`/accounts/login`, `/oauth`) and `facebook.com` (`/dialog/oauth`).
* **Mobile (Android & iOS):**
  * Android popup gate ([`modules/nora-view/android/.../NoraView.kt`](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L288-L305)):
  ```kotlin
  fun isGoogleOAuthPopupUrl(url: String): Boolean {
    // Only checks accounts.google.*, linkedin.com, twitter.com/x.com, appleid.apple.com
    // Neither instagram.com nor facebook.com is included!
  }
  ```
  * When Instagram opens a Facebook OAuth popup on mobile:
    * Android: `NoraView.kt` executes `popup.stopLoading()`, destroys popup, and dispatches a `new-tab` event.
    * iOS: `NoraView.swift` executes `dismissPopup()` and calls `emitCustomEvent(type: "new-tab")`.

---

### 2.3 Facebook

#### Flow Overview
* Entry points: `https://m.facebook.com` (mobile/home) and `https://www.facebook.com/messages/` ([`lib/page.ts`](file:///home/diya/Nora/lib/page.ts#L16-L17)).
* Authenticated status is verified via `c_user` and `xs` cookies ([`lib/watch-account.ts`](file:///home/diya/Nora/lib/watch-account.ts#L29)).

#### Implementation & URL Rewriting
* On mobile and non-desktop tabs, Facebook desktop URLs are aggressively rewritten to mobile endpoints.
* Snippet from [`modules/nora-view/android/.../NoraView.kt`](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L207-L221):
```kotlin
fun shouldRedirectFacebookToMobile(currentUrl: String, targetUrl: String, desktopMode: Boolean): Boolean {
  if (desktopMode) return false
  if (!targetUrl.startsWith("https://www.facebook.com/")) return false
  if (isDesktopFacebookUrl(targetUrl)) return false // only /messages & /marketplace
  if (isMessengerUrl(currentUrl)) return false
  return true
}
```
* When `shouldRedirectFacebookToMobile` returns `true`, navigations are cancelled and redirected via `load(url.replace("www", "m"))`.

---

### 2.4 LinkedIn

#### Flow Overview
* Entry point: `https://www.linkedin.com` ([`lib/page.ts`](file:///home/diya/Nora/lib/page.ts#L19)).
* Users authenticate via credentials or "Sign in with Google" (`/uas/connect/google`).

#### Implementation & Popup Handling
* **Desktop:** `isOAuthPopupUrl` explicitly includes `linkedin.com` OAuth endpoints:
```typescript
if (host.includes('linkedin.com')) {
  if (path.includes('connect/google') || path.includes('/uas/oauth') || path.includes('/checkpoint/oauth') || path.includes('/oauth') || search.includes('google')) {
    return true
  }
}
```
* **Mobile (Android & iOS):** `isGoogleOAuthPopupUrl` includes `linkedin.com` only if path/query contains `connect/google`, `oauth`, or `google`.
* When "Sign in with Google" is clicked, LinkedIn opens a popup navigating to `accounts.google.com`.

---

## 3. Shared Browser & Session Configuration

### 3.1 User-Agent Strategy
Configured in [`lib/useragent.ts`](file:///home/diya/Nora/lib/useragent.ts#L4-L18):
```typescript
const chromeVersion = 131
export function getUserAgent(platform: string, isDesktop = false) {
  const mobile = isDesktop ? '' : 'Mobile '
  const brand = platform == 'ios' && !isDesktop ? 'CriOS' : 'Chrome'
  // Generates:
  // Android: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36
  // iOS: Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile Safari/537.36
  // Desktop: Mozilla/5.0 (Windows/Mac/Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
}
```
* **Desktop Google Override:** `FIREFOX_UA` (Firefox 133 string) is injected specifically for Google accounts domains via `webRequest.onBeforeSendHeaders`.

### 3.2 Client Hints & Request Header Modifications
* **Desktop:** `setupGoogleAuthSession` strips `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `sec-ch-ua-model`, `x-client-data`, and existing `user-agent` on requests to Google domains.
* **Android & iOS WebViews:** No native Client Hints header modification is applied. Android WebKit automatically sends default Chromium client hints for the underlying system WebView engine.

### 3.3 Injected JavaScript & Preloads
1. **Desktop Preload ([`desktop/src/preload/index.ts`](file:///home/diya/Nora/desktop/src/preload/index.ts#L11-L85)):**
   * Preload runs in every frame (`nodeIntegrationInSubFrames: true`).
   * On non-Google domains (`!isGoogleAuthDomain`), exposes `window.electron` via `contextBridge.exposeInMainWorld`.
2. **In-Page Content Scripts ([`content/main.ts`](file:///home/diya/Nora/content/main.ts) & [`content/ad.ts`](file:///home/diya/Nora/content/ad.ts)):**
   * Injects ad-blocking, dialog handlers, and UI observers.
   * **Monkey-patches `window.fetch` and `window.XMLHttpRequest`** to inspect and filter network responses.
   * Injects `window.Nora` helper object.
3. **Android Native Interface ([`modules/nora-view/android/.../NoraView.kt`](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L1329)):**
   * Injects `window.NoraI` JavascriptInterface on the main WebView.

### 3.4 Session & Cookie Partitioning
* **Desktop:** Partitioned by profile using Electron partitions: `persist:${tab.profile || 'default'}` ([`desktop/src/main/ipc/main.ts`](file:///home/diya/Nora/desktop/src/main/ipc/main.ts#L61-L76)).
* **Android:** Uses Android Multi-Profile API (`ProfileStore.getInstance().getProfile(profileName)`) when supported (Android 14+ / WebView 114+). Falls back to default shared `CookieManager`.
* **iOS:** Uses `WKWebsiteDataStore(forIdentifier:)` on iOS 17.0+. Falls back to `WKWebsiteDataStore.default()` on earlier versions or default profile.

---

## 4. Platform-Specific Configuration

### 4.1 Android
* **Intent Filters ([`app.config.ts`](file:///home/diya/Nora/app.config.ts#L6-L29)):**
  * Intercepts `VIEW` / `BROWSABLE` for: `www.facebook.com`, `m.facebook.com`, `www.instagram.com`, `www.linkedin.com`, `bsky.app`, `x.com`, `threads.com`, `tiktok.com`, `reddit.com`.
  * `accounts.google.com` is deliberately omitted from intent filters.
* **Custom Scheme:** `nora` (handles `nora:auth` via Expo Linking).

### 4.2 iOS
* **Bundle Identifier:** `jp.nonbili.nora`
* **Custom Scheme:** `nora`
* **Universal Links:** None declared in `app.config.ts` for authentication callback.

### 4.3 Desktop Protocol Registration
* Declared in [`desktop/electron-builder.yml`](file:///home/diya/Nora/desktop/electron-builder.yml#L16-L19): Scheme `nora`.
* Registered at runtime in [`desktop/src/main/lib/deeplink.ts`](file:///home/diya/Nora/desktop/src/main/lib/deeplink.ts#L8-L14) via `app.setAsDefaultProtocolClient('nora')`.
* Second-instance lock dispatches incoming deep links via `uiClient.handleDeeplink(url)`.

---

## 5. Potential Causes of Login Failures (Hypotheses)

### Hypothesis H1: Google OAuth Blocks Embedded WebViews on Mobile (Google, LinkedIn)
* **Mechanism:** Google strictly enforces its "Disallowed User-Agent" policy on embedded mobile WebViews (Android `WebView` and iOS `WKWebView`). When logging into Google directly or clicking "Sign in with Google" on LinkedIn, Google's BotGuard script inspects client capabilities, hardware keystore integration, and WebView markers.
* **Symptoms:** Error 403: `disallowed_useragent` or *"Couldn't sign you in. This browser or app may not be secure."*
* **Root Cause in Code:**
  * Android: `NoraView.kt` loads Google OAuth inside an embedded `NouWebView` and attempts to bypass detection using `OAUTH_SHIM_SCRIPT` (mocking `window.chrome`). Modern Google OAuth detects WebViews via WebGL vendor strings, missing Play Services integration, and the `window.NoraI` bridge.
  * iOS: `NoraView.swift` loads Google OAuth in `WKWebView` with a Chrome iOS User-Agent (`CriOS`), which mismatches Safari WebKit JavaScript features.

### Hypothesis H2: Android Booting Google Navigations to External Browser (Google)
* **Mechanism:** In [`modules/nora-view/android/.../NoraView.kt` (`shouldOpenInSystemBrowser`)](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L353-L361), `isGoogleHost` is **not excluded** (unlike Desktop `link-handling.ts` and iOS `NoraView.swift`).
* **Symptoms:** If the user enables the setting "Open external links in system browser", any in-page navigation or redirect to `accounts.google.com` immediately launches the external system browser (`ACTION_VIEW`), abandoning the Synora tab.

### Hypothesis H3: Meta/Facebook OAuth Popups Severed into Orphan Tabs on Mobile (Instagram, Facebook)
* **Mechanism:** On Android and iOS, `isGoogleOAuthPopupUrl` only whitelists Google, LinkedIn, X, and Apple.
* **Symptoms:** When clicking "Log in with Facebook" inside Instagram, or any Facebook login popup, the popup URL matches `facebook.com/dialog/oauth`.
* **Root Cause in Code:**
  * Android (`NoraView.kt` L1163): Hits the `else` branch of `isGoogleOAuthPopupUrl` -> calls `popup.stopLoading()`, destroys popup, and fires `emit("new-tab")`.
  * iOS (`NoraView.swift` L607): Hits `else` branch -> calls `dismissPopup()` and fires `emitCustomEvent(type: "new-tab")`.
  * Opening the OAuth dialog in a new tab completely severs `window.opener`. The OAuth redirect cannot communicate tokens or cookies back to the opening page.

### Hypothesis H4: Aggressive Facebook Desktop-to-Mobile URL Rewriting Drops Auth State (Facebook)
* **Mechanism:** In `NoraView.kt` (L207-221, L909-914, L976-981) and `NoraView.swift` (L613-617), any navigation to `https://www.facebook.com/...` that is not `/messages` or `/marketplace` is intercepted and forcefully redirected to `m.facebook.com`.
* **Symptoms:** During Facebook authentication, 2FA prompts, or security checkpoints (`https://www.facebook.com/login.php`, `/checkpoint/`), Nora halts the load and triggers `load(url.replace("www", "m"))`. This drops HTTP POST bodies, session state, and nonce parameters, causing CSRF failures or looping login forms.

### Hypothesis H5: Anti-Bot & Fraud Detection Triggered by Prototype Patching & Foreign Globals (Instagram, Facebook, LinkedIn)
* **Mechanism:**
  * **Fetch/XHR Hooking:** `content/ad.ts` (L110-L180) monkey-patches `window.fetch` and `window.XMLHttpRequest`. Anti-bot solutions used by Meta (Datadome/X-FB-LSD) and LinkedIn (Arkose Labs / FunCaptcha) check function integrity via `Function.prototype.toString.call(fetch)` and prototype property descriptors. Tampered native functions trigger automated bot flags.
  * **Exposed Globals:** `desktop/src/preload/index.ts` exposes `window.electron` on all non-Google domains (including `instagram.com`, `facebook.com`, and `linkedin.com`). On Android, `window.NoraI` is exposed. These globals notify security scripts that the browser is driven by an automated or embedded harness.
* **Symptoms:** "Challenge Required", infinite CAPTCHA loops, or immediate checkpoint locks upon entering credentials.

### Hypothesis H6: Desktop Electron Fingerprint & Client Hints Discrepancy (Google, LinkedIn)
* **Mechanism:** On Desktop, `setupGoogleAuthSession` overrides HTTP request headers to Firefox 133 and strips `Sec-CH-UA` headers, but does not alter the underlying Chromium DOM runtime.
* **Symptoms:** `navigator.userAgentData` (a Chromium-only API) remains present on `window.navigator`, and `navigator.vendor` returns "Google Inc." while HTTP headers claim Firefox (Gecko). Google BotGuard identifies this synthetic header spoofing and rejects sign-in.
* **Popup Session Inheritance:** In `desktop/src/main/index.ts`, `setWindowOpenHandler` does not specify `session` in `overrideBrowserWindowOptions`. If the parent webview belongs to a secondary profile partition (`persist:profile_2`), the popup may default to a mismatched session, failing to share auth cookies with the opener.

---

## 6. Errors, Logging, & Telemetry

### 6.1 Existing Error Handling
* **Desktop:**
  * No listener attached for `did-fail-load`, `did-fail-provisional-load`, or `certificate-error` on `BrowserWindow` or guest `webContents`.
  * Auth popup failures fail silently to the user as blank pages or provider error screens.
* **Android (`NoraView.kt`):**
  * `WebViewClient.onReceivedError` and `onReceivedHttpError` are **not implemented**.
  * SSL errors and HTTP 4xx/5xx responses are unlogged.
* **iOS (`NoraView.swift`):**
  * `didFail` and `didFailProvisionalNavigation` are hooked strictly for proxy connection recovery (`handleProxyLoadError`), not for auth diagnostics.

---

## 7. Missing Information Requiring Manual Verification

1. **Active OAuth Popup Behavior in Production Builds:**
   * Verify whether Electron child windows opened via `setWindowOpenHandler` consistently inherit the parent `<webview>` session partition across all OS platforms (Linux AppImage vs macOS vs Windows).
2. **Behavior of LinkedIn Google Sign-In on Native Devices:**
   * Verify whether Google blocks LinkedIn login with `403 disallowed_useragent` immediately upon popup launch on standard Android devices with Google Play Services installed.
3. **Arkose Labs CAPTCHA Behavior on LinkedIn & Meta:**
   * Test whether disabling `content/ad.ts` prototype patching (`blockAds()`) allows Arkose Labs and Meta checkpoints to complete successfully.
4. **Behavior with "Open external links in system browser" Setting Enabled:**
   * Test whether enabling `openExternalLinkInSystemBrowser` reproduces the ejection of Google account pages to the external Android browser.

