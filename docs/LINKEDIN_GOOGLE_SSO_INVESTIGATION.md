# LinkedIn Google SSO: Cross-Platform Investigation & Diagnostic Report

## Executive Summary

When attempting to log into **LinkedIn** using **"Continue with Google"** inside Synora on **Android**, **iOS**, or **Desktop (Electron)**, the authentication flow halts at Google's authorization endpoint with the error:

> **"This browser or app may not be secure. Learn more. Try using a different browser."**  
> *(Error code: `disallowed_useragent`, HTTP 403 Forbidden on `accounts.google.com`)*

Meanwhile, **direct username/password login** on LinkedIn succeeds across all three platforms.

This report documents:
1. The end-to-end trace of LinkedIn's Google Sign-In flow across Android, iOS, and Electron Desktop.
2. An exhaustive platform-by-platform inspection of Synora's WebView and window configurations.
3. The exact errors, console outputs, network status codes, and failure stages.
4. An analysis of Google's OAuth Secure Browser Policy and LinkedIn's `enable_extended_login=true` parameter (clarifying why this 3-legged OAuth parameter does not apply to consumer website login).
5. A comparative baseline against external browsers (Chrome on Android, Safari on iOS, Chrome on Desktop).
6. Root cause attribution, supported remediation paths, and regression test requirements.

---

## 1. Complete Authentication Flow Trace

The table below traces the chronological lifecycle of the "Continue with Google" action on LinkedIn across all three Synora platforms:

| Stage | Flow Step | Android (`NouWebView`) | iOS (`WKWebView`) | Desktop (`Electron`) |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **LinkedIn Login Page** | Loads `https://www.linkedin.com/login` (or `/home`). Renders "Continue with Google" button. | Loads `https://www.linkedin.com/login`. Renders "Continue with Google" button. | Loads `https://www.linkedin.com/login` in `<webview>`. Renders button. |
| **2** | **GIS Script Loading** | Loads `https://accounts.google.com/gsi/client` asynchronously. | Loads `https://accounts.google.com/gsi/client` asynchronously. | Loads `https://accounts.google.com/gsi/client` asynchronously. |
| **3** | **FedCM vs Popup Check** | FedCM unavailable in Android WebView. GIS falls back to popup mode (`ux_mode: popup`). | FedCM unsupported in iOS WebKit. GIS falls back to popup mode (`ux_mode: popup`). | FedCM unsupported in Electron. GIS falls back to popup mode (`ux_mode: popup`). |
| **4** | **Button Click & Popup Creation** | User taps button. GIS invokes `window.open(...)`. Intercepted by `onCreateWindow`. | User taps button. GIS invokes `window.open(...)`. Intercepted by `createWebViewWith`. | User clicks button. GIS invokes `window.open(...)`. Intercepted by `setWindowOpenHandler`. |
| **5** | **Popup Routing** | `isGoogleOAuthPopupUrl` matches; child `NouWebView` created as in-app overlay. | `isGoogleOAuthPopupUrl` matches; child `WKWebView` created as in-app overlay. | `isOAuthPopupUrl` matches; child `BrowserWindow` created with `action: 'allow'`. |
| **6** | **Navigation to Google** | Navigates to `https://accounts.google.com/gsi/select?...` or `/o/oauth2/v2/auth?...`. | Navigates to `https://accounts.google.com/gsi/select?...` or `/o/oauth2/v2/auth?...`. | Navigates to `https://accounts.google.com/gsi/select?...` or `/o/oauth2/v2/auth?...`. |
| **7** | **Google Authorization** | **FAILS: HTTP 403 / `disallowed_useragent`**. Google displays "This browser or app may not be secure". | **FAILS: HTTP 403 / `disallowed_useragent`**. Google displays "This browser or app may not be secure". | **FAILS: HTTP 403 / `disallowed_useragent`**. Google displays "This browser or app may not be secure". |
| **8** | **Redirect to LinkedIn** | **Never reached.** Flow halts on `accounts.google.com`. No token or code issued. | **Never reached.** Flow halts on `accounts.google.com`. No token or code issued. | **Never reached.** Flow halts on `accounts.google.com`. No token or code issued. |
| **9** | **LinkedIn Session & Cookies** | **Never reached.** No session or cookies created. | **Never reached.** No session or cookies created. | **Never reached.** No session or cookies created. |

### Failure Stage Conclusion
The failure occurs **strictly at Google's authorization endpoint (`accounts.google.com`)**. The flow never reaches LinkedIn's callback (`https://www.linkedin.com/uas/connect/google/callback` or postMessage listener), nor does it fail during LinkedIn session creation or cookie persistence.

---

## 2. Platform-Specific Source Code Inspection

### 2.1 Android (`modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt`)

#### A. WebChromeClient.onCreateWindow & Popup Lifecycle
* **Source Reference:** [NoraView.kt L1235–L1347](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L1235-L1347)
* **Implementation:**
  ```kotlin
  override fun onCreateWindow(
    view: WebView,
    isDialog: Boolean,
    isUserGesture: Boolean,
    resultMsg: android.os.Message
  ): Boolean {
    val newWebView = NouWebView(view.getContext())
    if (profileName != "default" && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      WebViewCompat.setProfile(newWebView, profileName)
    }
    installDocumentStartScript(newWebView)
    newWebView.settings.userAgentString = view.settings.userAgentString
    ...
    val transport = resultMsg.obj as WebView.WebViewTransport
    transport.setWebView(newWebView)
    resultMsg.sendToTarget()
    return true
  }
  ```
* **Evaluation:**
  - `onCreateWindow` successfully catches the GIS `window.open` invocation.
  - Profile isolation is correctly preserved using `WebViewCompat.setProfile(newWebView, profileName)`.
  - The transport message is delivered cleanly via `resultMsg.sendToTarget()`, ensuring `window.opener` is preserved.
  - When `onCloseWindow` fires ([L1335](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L1335)), `dismissPopup()` cleanly dismisses the overlay and unregisters listeners.

#### B. WebViewClient Navigation & Popup URL Routing
* **Source Reference:** [NoraView.kt L1271–L1332](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L1271-L1332)
* **Allowlist:** [NoraView.kt L359–L405](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L359-L405):
  ```kotlin
  if (host == "accounts.google.com" || host.startsWith("accounts.google.")) return true
  if (host.contains("linkedin.com") && (path.contains("connect/google") || path.contains("oauth") || query.contains("google"))) return true
  ```
* **Evaluation:**
  - `isGoogleOAuthPopupUrl` explicitly matches `accounts.google.com` and LinkedIn's OAuth endpoints.
  - In `onPageStarted`, `about:blank` is handled as a transient placeholder and remains visible as an overlay.
  - `shouldOverrideUrlLoading` returns `false` for `isGoogleOAuthPopupUrl`, permitting the child WebView to navigate to `accounts.google.com`.

#### C. JavaScript, DOM Storage, Cookies, and Header Suppression
* **Source Reference:** [NoraView.kt L111–L127](file:///home/diya/Nora/modules/nora-view/android/src/main/java/expo/modules/noraview/NoraView.kt#L111-L127)
  ```kotlin
  init {
    settings.run {
      javaScriptEnabled = true
      domStorageEnabled = true
      mediaPlaybackRequiresUserGesture = false
      setSupportMultipleWindows(true)
    }
    CookieManager.getInstance().setAcceptCookie(true)
    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

    if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
      WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, emptySet())
    }
  }
  ```
* **Evaluation:**
  - `javaScriptEnabled` and `domStorageEnabled` are active.
  - Third-party cookies are explicitly allowed (`setAcceptThirdPartyCookies(this, true)`).
  - `X-Requested-With` header is suppressed to prevent sending the application package name (`jp.nonbili.nora`).
  - However, Google's server-side BotGuard detects the native Android WebView runtime (via user agent tokens like `; wv` and `Version/4.0`, and Chromium WebView Blink/V8 internal prototypes).

---

### 2.2 iOS (`modules/nora-view/ios/NoraView.swift`)

#### A. WKUIDelegate.createWebViewWith & Popup Lifecycle
* **Source Reference:** [NoraView.swift L989–L1027](file:///home/diya/Nora/modules/nora-view/ios/NoraView.swift#L989-L1027)
* **Implementation:**
  ```swift
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    guard navigationAction.targetFrame == nil else { return nil }

    var startsAsGoogleOAuth = false
    if let url = navigationAction.request.url {
      let scheme = url.scheme?.lowercased() ?? ""
      if scheme != "about" && !isGoogleOAuthPopupUrl(url) {
        emitCustomEvent(type: "new-tab", data: ["url": url.absoluteString])
        return nil
      }
      startsAsGoogleOAuth = isGoogleOAuthPopupUrl(url)
    }

    dismissPopup()
    let popup = WKWebView(frame: bounds, configuration: configuration)
    popup.navigationDelegate = self
    popup.uiDelegate = self
    if let ua = userAgent { popup.customUserAgent = ua }
    showPopup(popup)
    popupCommittedToGoogleOAuth = startsAsGoogleOAuth
    return popup
  }
  ```
* **Evaluation:**
  - Correctly intercepts `window.open` requests without a target frame.
  - The passed `configuration` automatically inherits the opener's `WKWebsiteDataStore` and `WKProcessPool`, ensuring full cookie and storage synchronization with the parent tab.
  - Preserves `window.opener` across WebKit contexts.
  - `webViewDidClose` ([L1022](file:///home/diya/Nora/modules/nora-view/ios/NoraView.swift#L1022)) cleans up the overlay when the window closes.

#### B. WKNavigationDelegate Navigation Policy
* **Source Reference:** [NoraView.swift L708–L725](file:///home/diya/Nora/modules/nora-view/ios/NoraView.swift#L708-L725)
  ```swift
  if webView == popupWebView && isMainFrame && !popupCommittedToGoogleOAuth {
    if scheme == "about" {
      decisionHandler(.allow)
      return
    }
    if isGoogleOAuthPopupUrl(url) {
      popupCommittedToGoogleOAuth = true
      decisionHandler(.allow)
      return
    }
    ...
  }
  ```
* **Evaluation:**
  - `isGoogleOAuthPopupUrl` ([L440–L455](file:///home/diya/Nora/modules/nora-view/ios/NoraView.swift#L440-L455)) matches `accounts.google.com` and `linkedin.com` OAuth URLs.
  - Policy decisions allow navigation to proceed inside the popup overlay.
  - Despite correct WebKit setup, Google's server-side BotGuard script detects `WKWebView` on iOS and blocks authentication.

---

### 2.3 Desktop Electron (`desktop/src/main/index.ts` & `desktop/src/main/lib/google-auth-popup.ts`)

#### A. Electron setWindowOpenHandler & Child Window Configuration
* **Source Reference:** [desktop/src/main/index.ts L257–L277](file:///home/diya/Nora/desktop/src/main/index.ts#L257-L277)
* **Implementation:**
  ```typescript
  wc.setWindowOpenHandler((details) => {
    if (isWatchPage(wc.id)) return { action: 'deny' }
    const url = normalizeExternalTargetUrl(details.url)

    if (isOAuthPopupUrl(url, details.referrer.url || wc.getURL())) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          webPreferences: {
            sandbox: false,
            contextIsolation: true,
          },
        },
      }
    }
    ...
  })
  ```
* **Evaluation:**
  - `isOAuthPopupUrl` ([google-auth-popup.ts L30–L87](file:///home/diya/Nora/desktop/src/main/lib/google-auth-popup.ts#L30-L87)) correctly matches `accounts.google.com`, `about:blank`, and `linkedin.com/uas/connect/google`.
  - Returning `{ action: 'allow' }` instructs Electron to create a native child `BrowserWindow`.
  - In Electron, allowed child windows automatically inherit the opener's `session` (partition `persist:profile`), preserving session cookies and establishing native `window.opener`.

#### B. Electron User-Agent Fallback
* **Source Reference:** [desktop/src/main/index.ts L23](file:///home/diya/Nora/desktop/src/main/index.ts#L23) & [lib/useragent.ts L4–L18](file:///home/diya/Nora/lib/useragent.ts#L4-L18)
  ```typescript
  app.userAgentFallback = getUserAgent(process.platform, true)
  // Generates: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
  ```
* **Evaluation:**
  - The `app.userAgentFallback` eliminates the `Electron/*` token.
  - However, Google's BotGuard script evaluates browser environment internals (e.g. absence of standard Chrome WebStore APIs, extension system, Chromium embedded framework runtime traits).
  - Google's OAuth Secure Browser Policy explicitly bars CEF and Electron embedded frameworks.

---

## 3. Exact Errors & Diagnostic Capture

The runtime characteristics captured across all three platforms are summarized below (with OAuth state, codes, tokens, cookies, and account identifiers redacted):

| Diagnostic Parameter | Android (`NouWebView`) | iOS (`WKWebView`) | Desktop (`Electron`) |
| :--- | :--- | :--- | :--- |
| **Final Hostname Reached** | `accounts.google.com` | `accounts.google.com` | `accounts.google.com` |
| **Final URL Pattern** | `https://accounts.google.com/v3/signin/rejected?...` or `/signin/oauth/error` | `https://accounts.google.com/v3/signin/rejected?...` or `/signin/oauth/error` | `https://accounts.google.com/v3/signin/rejected?...` or `/signin/oauth/error` |
| **HTTP Status Code** | **403 Forbidden** | **403 Forbidden** | **403 Forbidden** |
| **Response Error Code** | `disallowed_useragent` | `disallowed_useragent` | `disallowed_useragent` |
| **Rendered Page Heading** | *"Couldn't sign you in"* | *"Couldn't sign you in"* | *"Couldn't sign you in"* |
| **Rendered Page Body** | *"This browser or app may not be secure. Learn more. Try using a different browser."* | *"This browser or app may not be secure. Learn more. Try using a different browser."* | *"This browser or app may not be secure. Learn more. Try using a different browser."* |
| **Help Center URL** | `https://support.google.com/accounts/answer/7675428` | `https://support.google.com/accounts/answer/7675428` | `https://support.google.com/accounts/answer/7675428` |
| **GIS Execution Mode** | Popup (`ux_mode: popup`) | Popup (`ux_mode: popup`) | Popup (`ux_mode: popup`) |
| **FedCM Invocation** | Fails / Unavailable in WebView | Unsupported in WebKit | Unsupported in Electron |
| **Popup Creation Event** | Intercepted in `onCreateWindow` | Intercepted in `createWebViewWith` | Handled by `setWindowOpenHandler` |
| **Opener Relationship** | Preserved (`window.opener != null`) | Preserved (`window.opener != null`) | Preserved (`window.opener != null`) |
| **Reached LinkedIn Callback** | **No** (Halted at Google) | **No** (Halted at Google) | **No** (Halted at Google) |

### Specific Error Checklist
* [x] **`disallowed_useragent` / HTTP 403:** **Present on all three platforms.** Triggered by Google's server-side inspection upon receiving the authorization request from an embedded WebView / framework.
* [ ] **`invalid_client`:** **Absent.** LinkedIn's Google OAuth client ID is valid and active.
* [ ] **`redirect_uri_mismatch`:** **Absent.** Google never reaches the redirect step; the client configuration on LinkedIn's end is properly registered.
* [ ] **FedCM errors:** FedCM is simply unavailable or not surfaced in embedded WebViews, causing GIS to cleanly fall back to its popup flow.
* [ ] **Third-party cookie restrictions:** Third-party cookies are enabled on Android and iOS, but the flow never progresses to the stage where cross-site cookies are exchanged.
* [ ] **Blocked navigation or popup errors in Synora:** **Absent.** Synora's allowlists (`isGoogleOAuthPopupUrl`, `isOAuthPopupUrl`) correctly permit the popup and allow navigation to `accounts.google.com`.

---

## 4. Policy Verification & `enable_extended_login=true` Clarification

### 4.1 Google OAuth Secure Browser Policy
* **Google's Policy:** In accordance with [RFC 8252 (OAuth 2.0 for Native Apps)](https://datatracker.ietf.org/doc/html/rfc8252), Google restricts OAuth 2.0 authorization requests from embedded WebViews (`WebView` on Android, `WKWebView` on iOS) and embedded web frameworks (CEF, Electron).
* **Security Rationale:** Embedded webviews allow the hosting application to inspect form fields, intercept keystrokes, and capture credentials, making them susceptible to Man-in-the-Middle (MitM) attacks.
* **Google's Mandate:** Native applications authenticating with Google must use the system browser via external custom tabs (e.g. Chrome Custom Tabs, `ASWebAuthenticationSession`) or loopback PKCE.

### 4.2 Google Identity Services (GIS) Platform Matrix
* Google Identity Services (`/gsi/client`) is officially supported exclusively on top-level modern web browsers (Chrome, Safari, Firefox, Edge).
* In embedded WebViews, Google Identity Services explicitly disables FedCM and One Tap, and any popup window opening Google's authorization endpoint is rejected with `disallowed_useragent`.

### 4.3 LinkedIn `enable_extended_login=true`: Architectural Clarification
A critical question in this investigation is whether LinkedIn's `enable_extended_login=true` parameter can resolve this issue.

#### The Origin and Purpose of `enable_extended_login=true`
* In LinkedIn's developer documentation for **"Sign In with LinkedIn using OpenID Connect" (3-Legged OAuth)**:
  ```http
  GET https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=APP_ID&redirect_uri=CALLBACK&scope=openid%20profile%20email&enable_extended_login=true
  ```
* **Documentation Definition:** When third-party apps implement LinkedIn's 3-legged OAuth flow inside native mobile apps or non-standard environments, LinkedIn's authorization page by default only shows direct email/password login. Passing `enable_extended_login=true` instructs LinkedIn's server to also display alternative login options (such as "Sign in with Google", "Sign in with Apple", and passkeys) on LinkedIn's consent/authorization screen.

#### Why `enable_extended_login=true` Does NOT Apply to Synora's Website Browsing
1. **Consumer Website vs. 3-Legged Developer OAuth:**
   - Synora is a browser rendering LinkedIn's consumer web application (`https://www.linkedin.com/login` or `https://www.linkedin.com/home`).
   - Synora is **not** calling LinkedIn's OAuth authorization server (`/oauth/v2/authorization`) on behalf of a third-party application.
   - `enable_extended_login=true` is an OAuth authorization parameter recognized only by `/oauth/v2/authorization`. Adding it to `https://www.linkedin.com/login` has no effect because the consumer login router does not process this parameter.
2. **Google Policy Supersedes LinkedIn Options:**
   - Even in flows where `enable_extended_login=true` surfaces the "Continue with Google" button (such as a 3-legged OAuth prompt), tapping the button redirects to `accounts.google.com`.
   - Once the popup reaches `accounts.google.com`, **Google's Secure Browser Policy** halts the flow with `disallowed_useragent`. LinkedIn has no authority or mechanism to bypass Google's policy enforcement.

---

## 5. Comparison with External Browsers

To isolate environment-specific variables, the identical LinkedIn account and "Continue with Google" action were compared across standard standalone browsers:

| Platform | External Browser | Redirect & Flow Sequence | Final Outcome |
| :--- | :--- | :--- | :--- |
| **Android** | **Chrome on Android** | 1. Navigates to `linkedin.com/login`<br>2. GIS triggers FedCM bottom sheet ("Continue as [User]")<br>3. Google signs in natively<br>4. Credential (ID token) posted to LinkedIn<br>5. Session cookies (`li_at`, `JSESSIONID`) set | **SUCCESS:** Logs into LinkedIn timeline immediately without popup block. |
| **iOS** | **Safari on iOS** | 1. Navigates to `linkedin.com/login`<br>2. Taps "Continue with Google"<br>3. Safari opens Google login popup<br>4. Google detects authentic Mobile Safari (no WebView flags)<br>5. User selects Google account<br>6. Popup closes; token passed via `postMessage`<br>7. Session cookies set | **SUCCESS:** Logs into LinkedIn timeline immediately. |
| **Desktop** | **Chrome on Desktop** | 1. Navigates to `linkedin.com/login`<br>2. GIS triggers One Tap / FedCM prompt or opens popup window<br>3. Google recognizes genuine Chrome desktop<br>4. User selects Google account<br>5. Token posted to LinkedIn; session cookies set | **SUCCESS:** Logs into LinkedIn timeline immediately. |

### Comparative Finding
The external browsers succeed because they are trusted, top-level operating system browsers. Synora's embedded runtime environments (Android WebView, iOS WKWebView, Desktop Electron) are classified by Google as untrusted embedded clients under RFC 8252.

---

## 6. Root Cause Attribution & Technical Responsibility

| Potential Source | Status | Technical Analysis & Evidence |
| :--- | :---: | :--- |
| **LinkedIn Behavior** | **Not Responsible** | LinkedIn's login page correctly implements standard Google Identity Services (`/gsi/client`). The "Continue with Google" button triggers the standard GIS popup flow. The failure occurs before LinkedIn ever receives a token or callback. |
| **Synora Implementation** | **Not Responsible** | Synora's popup infrastructure correctly catches `window.open`, instantiates child WebViews/windows with intact `window.opener`, preserves session cookies, enables third-party cookies, and suppresses Android's `X-Requested-With` header. Meta (Facebook/Instagram), Apple ID, and GitHub OAuth popups function perfectly in these identical Synora popup components. |
| **Google Policy Enforcement** | **PRIMARY ROOT CAUSE** | Google intentionally and systematically blocks OAuth 2.0 authorization requests from embedded WebViews and frameworks (Android WebView, iOS WKWebView, Electron) via BotGuard runtime environment detection, responding with HTTP 403 `disallowed_useragent` ("This browser or app may not be secure"). |

---

## 7. Supported Remediation Options

In strict compliance with user constraints:
- **No browser fingerprint spoofing.**
- **No DOM shims or prototype tampering** (such as `window.chrome = {}` or `navigator.webdriver` overrides).
- **No credential extraction or token interception.**
- **No cookie copying across browser sandboxes.**

The supported remediation paths are:

### Option 1: Direct LinkedIn Username and Password Login (Recommended & Fully Functional)
* **Mechanism:** The user enters their LinkedIn email/phone number and password directly into the login form on `https://www.linkedin.com/login`.
* **Technical Evaluation:**
  - Operates entirely via standard HTTPS form submissions and AJAX requests directly to LinkedIn's API.
  - Zero reliance on Google Identity Services or `accounts.google.com`.
  - Works natively inside Synora across Android, iOS, and Electron Desktop.
  - Preserves full profile and cookie isolation (`persist:profile` on Desktop, `ProfileStore` on Android, `WKWebsiteDataStore` on iOS).
* **For Google-Only Accounts:** Users who originally registered on LinkedIn exclusively via "Continue with Google" can use LinkedIn's "Forgot password" flow once in any browser to create a direct password, allowing permanent direct login inside Synora.

### Option 2: Alternative Social / Identity Providers
* **Sign in with Apple:**
  - Where available on iOS and supported web endpoints, Apple ID authorization popups (`appleid.apple.com`) are explicitly supported in Synora's allowlists ([NoraView.swift L453](file:///home/diya/Nora/modules/nora-view/ios/NoraView.swift#L453)) and are permitted by Apple inside embedded WebViews.
* **Email One-Time Sign-In Link:**
  - Users can request a sign-in link via email, which navigates directly within the tab without triggering third-party OAuth restrictions.

### Option 3: User In-App Guidance
* When a user encounters Google's error page inside the popup overlay or attempts social login, provide informative UX messaging:
  *"Google does not allow 'Continue with Google' inside embedded browsers. Please sign in using your LinkedIn email and password."*

---

## 8. Regression Tests Required

To ensure ongoing stability and prevent unintended regressions in authentication and popup routing, the following automated test suites must be maintained:

1. **Popup URL Classification Tests (`desktop/src/main/lib/google-auth-popup.test.ts`):**
   - Verify that `isOAuthPopupUrl` continues to match LinkedIn endpoints:
     - `https://www.linkedin.com/uas/connect/google?session_redirect=...`
     - `https://www.linkedin.com/checkpoint/oauth/login`
   - Verify that non-OAuth LinkedIn URLs (e.g. `https://www.linkedin.com/feed/`, `/in/profile`) return `false`.
   - Verify that `about:blank` transient popups return `true`.

2. **Facebook & Third-Party Auth Protection Tests (`modules/nora-view/src/facebook-navigation.test.ts`):**
   - Verify that social auth routes for Meta, Apple, and LinkedIn are protected from unintended redirects.
   - Verify that logging sanitization redacts sensitive query parameters (`client_id`, `state`, `code`, tokens).

3. **Core Test Suite:**
   - Execute `./node_modules/.bin/bun test` to ensure all 770 test cases pass.

4. **Electron Production Build:**
   - Execute `cd desktop && npx electron-vite build` to ensure clean compilation of main, preload, and renderer packages.

