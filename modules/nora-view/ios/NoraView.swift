import ExpoModulesCore
import WebKit
import Network

let uaMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

private func isFacebookPathUrl(_ url: URL, prefix: String) -> Bool {
  let path = url.path
  return url.scheme == "https" &&
    (url.host == "www.facebook.com" || url.host == "m.facebook.com") &&
    (path == prefix || path.hasPrefix("\(prefix)/"))
}

func isMessengerUrl(_ url: URL) -> Bool {
  isFacebookPathUrl(url, prefix: "/messages")
}

func isMarketplaceUrl(_ url: URL) -> Bool {
  isFacebookPathUrl(url, prefix: "/marketplace")
}

func isDesktopFacebookUrl(_ url: URL) -> Bool {
  isMessengerUrl(url) || isMarketplaceUrl(url)
}

func isFacebookAuthOrSecurityUrl(_ url: URL) -> Bool {
  guard let host = url.host?.lowercased() else { return false }
  if !host.hasSuffix("facebook.com") && host != "fb.com" {
    return false
  }
  let path = url.path.lowercased()
  let query = url.query?.lowercased() ?? ""

  // Login endpoints
  if path == "/login" || path.hasPrefix("/login/") || path == "/login.php" {
    return true
  }
  // OAuth dialogs and authorization
  if path.contains("/dialog/oauth") || path == "/oauth" || path.hasPrefix("/oauth/") {
    return true
  }
  if query.contains("client_id") || (query.contains("redirect_uri") && query.contains("response_type")) {
    return true
  }
  // Checkpoints and account integrity challenges
  if path == "/checkpoint" || path.hasPrefix("/checkpoint/") {
    return true
  }
  // Two-factor authentication & step verification
  if path.contains("two_step_verification") || path.contains("two_factor") || path.contains("/2fa") {
    return true
  }
  // Security, recovery, auth verification
  if path == "/security" || path.hasPrefix("/security/") ||
     path == "/recover" || path.hasPrefix("/recover/") ||
     path == "/auth" || path.hasPrefix("/auth/") ||
     path == "/identity" || path.hasPrefix("/identity/") {
    return true
  }
  return false
}

func shouldRedirectFacebookToMobile(currentUrl: URL?, targetUrl: URL, desktopMode: Bool) -> Bool {
  if desktopMode {
    return false
  }
  guard let host = targetUrl.host?.lowercased(), host == "www.facebook.com" else {
    return false
  }
  if isDesktopFacebookUrl(targetUrl) {
    return false
  }
  if let current = currentUrl, isMessengerUrl(current) {
    return false
  }
  if isFacebookAuthOrSecurityUrl(targetUrl) || (currentUrl != nil && isFacebookAuthOrSecurityUrl(currentUrl!)) {
    return false
  }
  return true
}

func sanitizeUrlForLogging(_ url: URL?) -> String {
  guard let url = url else { return "" }
  guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
    return url.host ?? url.scheme ?? "[malformed-url]"
  }
  if let items = components.queryItems, !items.isEmpty {
    let sensitiveKeys: Set<String> = [
      "code", "token", "access_token", "refresh_token", "state", "secret",
      "password", "auth", "credential", "ticket", "session", "key"
    ]
    components.queryItems = items.map { item in
      let lower = item.name.lowercased()
      let isSensitive = sensitiveKeys.contains(lower) ||
        lower.contains("token") || lower.contains("secret") || lower.contains("pass") ||
        lower.contains("auth") || lower.contains("code")
      return URLQueryItem(name: item.name, value: isSensitive ? "[REDACTED]" : item.value)
    }
  }
  return components.string ?? "\(url.scheme ?? "https")://\(url.host ?? "")\(url.path)"
}

func sanitizeUrlForLogging(_ urlString: String) -> String {
  guard let url = URL(string: urlString) else { return "[malformed-url]" }
  return sanitizeUrlForLogging(url)
}

// Share links (vm.tiktok.com, vt.tiktok.com) redirect to www.tiktok.com keeping the agent they
// were loaded with, so they need the desktop one too.
func isTikTokUrl(_ url: URL) -> Bool {
  guard url.scheme == "https", let host = url.host else { return false }
  return host == "tiktok.com" || host.hasSuffix(".tiktok.com")
}

/// WKUserContentController holds its message handlers strongly, so adding the view itself
/// closed a cycle (view -> webView -> configuration -> controller -> view) and a closed
/// tab's view, webview and page were never freed. Forward through a weak reference instead.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
  private weak var handler: WKScriptMessageHandler?

  init(_ handler: WKScriptMessageHandler) {
    self.handler = handler
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    handler?.userContentController(userContentController, didReceive: message)
  }
}

class NoraView: ExpoView, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate, UIGestureRecognizerDelegate, WKDownloadDelegate {
  let onLoad = EventDispatcher()
  let onMessage = EventDispatcher()

  var webView: WKWebView!
  var scriptOnStart: String = ""
  var documentStartScript: String = ""
  var userAgent: String?
  var textZoom: Int = 100
  var lastTranslationY: CGFloat = 0
  var lastContextMenuLocation: CGPoint?
  var currentProfile: String = "default"
  var appliedBlocklistRuleList: WKContentRuleList?
  private var blocklistHost: String?
  private var popupContainer: UIView?
  private var popupWebView: WKWebView?
  private var popupCommittedToGoogleOAuth = false
  private var proxyObserver: NSObjectProtocol?
  private var proxyRetryURL: URL?
  private var proxyErrorShown = false
  /// Pull down from the top of the page to reload, like Safari and Firefox do. Off unless
  /// the setting turns it on, so pages with their own overscroll gestures are untouched.
  private var pullToRefreshEnabled = false
  private lazy var refreshControl: UIRefreshControl = {
    let control = UIRefreshControl()
    control.addTarget(self, action: #selector(handlePullToRefresh), for: .valueChanged)
    return control
  }()
  /// Destination picked for each in-flight WKDownload, read back when it finishes.
  private var downloadDestinations: [WKDownload: URL] = [:]

  // MARK: - Profile Data Store

  /// Maps profile name -> UUID stored in UserDefaults for stable identifier mapping
  private static func profileIdentifier(for profile: String) -> UUID {
    let key = "nora_profile_uuid_\(profile)"
    if let uuidString = UserDefaults.standard.string(forKey: key),
       let uuid = UUID(uuidString: uuidString) {
      return uuid
    }
    let uuid = UUID()
    UserDefaults.standard.set(uuid.uuidString, forKey: key)
    return uuid
  }

  private static func profileIdentifierKey(for profile: String) -> String {
    "nora_profile_uuid_\(profile)"
  }

  static func getCookies(profile: String, host: String, completion: @escaping (String) -> Void) {
    let store = dataStore(for: profile).httpCookieStore
    store.getAllCookies { cookies in
      let lowerHost = host.lowercased()
      let parts = cookies
        .filter { c in
          let domain = c.domain.lowercased()
          let normalized = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
          return lowerHost == normalized || lowerHost.hasSuffix("." + normalized)
        }
        .map { "\($0.name)=\($0.value)" }
      completion(parts.joined(separator: "; "))
    }
  }

  static func getProfileCookies(profile: String, completion: @escaping ([[String: Any]]) -> Void) {
    dataStore(for: profile).httpCookieStore.getAllCookies { cookies in
      completion(cookies.map { cookie in
        [
          "domain": cookie.domain,
          "path": cookie.path,
          "secure": cookie.isSecure,
          "httpOnly": cookie.isHTTPOnly,
          "expires": cookie.expiresDate?.timeIntervalSince1970 ?? 0,
          "name": cookie.name,
          "value": cookie.value,
        ]
      })
    }
  }

  private static func dataStore(for profile: String) -> WKWebsiteDataStore {
    let store: WKWebsiteDataStore
    if profile == "default" {
      store = WKWebsiteDataStore.default()
    } else if #available(iOS 17.0, *) {
      let identifier = profileIdentifier(for: profile)
      store = WKWebsiteDataStore(forIdentifier: identifier)
    } else {
      store = WKWebsiteDataStore.default()
    }
    if #available(iOS 17.0, *) {
      applyProxy(to: store)
    }
    return store
  }

  @available(iOS 17.0, *)
  static func applyProxy(to store: WKWebsiteDataStore) {
    NoraProxy.shared.apply(to: store)
  }

  static func clearProfileData(_ profile: String, promise: Promise) {
    if profile == "default" {
      WKWebsiteDataStore.default().removeData(
        ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
        modifiedSince: .distantPast
      ) {
        promise.resolve(nil)
      }
      return
    }

    if #available(iOS 17.0, *) {
      let dataStore = dataStore(for: profile)
      dataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
        UserDefaults.standard.removeObject(forKey: profileIdentifierKey(for: profile))
        promise.resolve(nil)
      }
      return
    }

    promise.resolve(nil)
  }

  static func clearHostData(_ profile: String, host: String, promise: Promise) {
    let normalizedHost = host.lowercased()
    let store = dataStore(for: profile)
    let types = WKWebsiteDataStore.allWebsiteDataTypes()
    store.fetchDataRecords(ofTypes: types) { records in
      let matching = records.filter { record in
        let name = record.displayName.lowercased()
        return name == normalizedHost || normalizedHost.hasSuffix("." + name) || name.hasSuffix("." + normalizedHost)
      }
      guard !matching.isEmpty else {
        promise.resolve(nil)
        return
      }
      store.removeData(ofTypes: types, for: matching) {
        promise.resolve(nil)
      }
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    NouController.shared.register(self)
    setupWebView(profile: "default")
    proxyObserver = NotificationCenter.default.addObserver(
      forName: NoraProxy.didChange, object: nil, queue: .main
    ) { [weak self] _ in self?.proxySettingsChanged() }
  }

  private func proxySettingsChanged() {
    do {
      try NoraProxy.shared.snapshot().validateBrowsing()
      proxyErrorShown = false
      if let url = proxyRetryURL {
        proxyRetryURL = nil
        webView.load(URLRequest(url: url))
      }
    } catch {
      proxyRetryURL = webView.url ?? proxyRetryURL
      webView.stopLoading()
      popupWebView?.stopLoading()
    }
  }

  private func reportProxyError() {
    guard !proxyErrorShown else { return }
    proxyErrorShown = true
    emitCustomEvent(type: "proxy-error", data: "")
  }

  private func createConfig(profile: String) -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    config.userContentController.add(WeakScriptMessageHandler(self), name: "NoraI")

    installUserScripts(config.userContentController)

    config.allowsInlineMediaPlayback = true
    config.preferences.javaScriptCanOpenWindowsAutomatically = true
    config.websiteDataStore = NoraView.dataStore(for: profile)

    return config
  }

  /// Adds every user script the webview needs, in injection order. Called on
  /// creation and again whenever one of the scripts changes, since a single
  /// user script can't be removed on its own.
  private func installUserScripts(_ controller: WKUserContentController) {
    controller.removeAllUserScripts()

    // Inject the bridge shim to match Android's NoraI.onMessage
    let bridgeScript = """
      window.NoraI = {
        onMessage: function(payload) {
          window.webkit.messageHandlers.NoraI.postMessage(payload);
        }
      };
    """
    controller.addUserScript(WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))

    let exclusionsScript = NouController.shared.blocklistExclusionsScript()
    if !exclusionsScript.isEmpty {
      controller.addUserScript(WKUserScript(source: exclusionsScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    }

    if !documentStartScript.isEmpty {
      controller.addUserScript(WKUserScript(source: documentStartScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    }

    if !scriptOnStart.isEmpty {
      controller.addUserScript(WKUserScript(source: scriptOnStart, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
    }
  }

  private func setupWebView(profile: String) {
    // Remove existing webview if present
    if webView != nil {
      dismissPopup()
      webView.removeObserver(self, forKeyPath: "title")
      webView.removeObserver(self, forKeyPath: "url")
      webView.removeFromSuperview()
    }

    let config = createConfig(profile: profile)

    webView = WKWebView(frame: bounds, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.scrollView.delegate = self
    webView.allowsBackForwardNavigationGestures = true
    // The system find bar, opened from the menu or with Cmd+F on a keyboard.
    webView.isFindInteractionEnabled = true
    let longPressRecognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleContextMenuLongPress(_:)))
    longPressRecognizer.cancelsTouchesInView = false
    longPressRecognizer.delegate = self
    webView.addGestureRecognizer(longPressRecognizer)

    if let ua = userAgent {
      webView.customUserAgent = ua
    }

    addSubview(webView)
    applyBlocklist(NouController.shared.blocklistRuleList)
    
    if #available(iOS 14.0, *) {
      webView.pageZoom = CGFloat(textZoom) / 100.0
    }

    // Observe title and URL changes
    webView.addObserver(self, forKeyPath: "title", options: .new, context: nil)
    webView.addObserver(self, forKeyPath: "url", options: .new, context: nil)

    applyPullToRefresh()
    applyActive()
  }

  /// Background tabs stay mounted behind the active one, so they are hidden rather than
  /// left compositing out of sight. A tab can also be inactive while on screen (paused by
  /// the user), which only suspends its media and keeps the page showing.
  private var active = true
  private var visible = true

  func setActive(_ value: Bool) {
    active = value
    applyActive()
  }

  func setVisible(_ value: Bool) {
    visible = value
    applyActive()
  }

  private func applyActive() {
    guard let webView = webView else { return }
    webView.isHidden = !visible
    if #available(iOS 15.0, *) {
      webView.setAllMediaPlaybackSuspended(!active || !visible, completionHandler: nil)
    }
  }

  @objc private func handlePullToRefresh() {
    guard let webView = webView else {
      refreshControl.endRefreshing()
      return
    }
    webView.reload()
  }

  func setPullToRefresh(_ enabled: Bool) {
    pullToRefreshEnabled = enabled
    applyPullToRefresh()
  }

  private func applyPullToRefresh() {
    guard let webView = webView else { return }
    if pullToRefreshEnabled {
      webView.scrollView.bounces = true
      if webView.scrollView.refreshControl !== refreshControl {
        webView.scrollView.refreshControl = refreshControl
      }
    } else {
      refreshControl.endRefreshing()
      if webView.scrollView.refreshControl === refreshControl {
        webView.scrollView.refreshControl = nil
      }
    }
  }

  private func isGoogleOAuthPopupUrl(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    if host == "accounts.google.com" || host.hasPrefix("accounts.google.") || host == "accounts.youtube.com" || host.hasPrefix("accounts.youtube.") {
      return true
    }
    let path = url.path.lowercased()
    let query = url.query?.lowercased() ?? ""
    if host.contains("linkedin.com") && (path.contains("connect/google") || path.contains("oauth") || query.contains("google")) {
      return true
    }
    if (host.contains("twitter.com") || host.contains("x.com")) && (path.contains("/i/flow") || path.contains("oauth") || query.contains("google")) {
      return true
    }
    if host == "appleid.apple.com" {
      return true
    }
    // Facebook / Meta login and OAuth flows (including "Log in with Facebook" on Instagram or other sites)
    if host.hasSuffix("facebook.com") || host == "facebook.com" || host.hasSuffix("fb.com") || host == "fb.com" {
      if path.contains("/dialog/oauth") ||
         path.contains("/login") ||
         path.contains("/oauth") ||
         path.contains("/plugins/login") ||
         path.contains("/checkpoint") ||
         path.contains("two_step_verification") ||
         path.contains("two_factor") ||
         query.contains("client_id") ||
         query.contains("redirect_uri") ||
         query.contains("app_id") {
        return true
      }
    }
    // Instagram OAuth and account sign-in popup flows
    if host.hasSuffix("instagram.com") || host == "instagram.com" {
      if path.contains("/accounts/login") ||
         path.contains("/accounts/emailsignup") ||
         path.contains("/oauth") ||
         path.contains("/login") ||
         query.contains("client_id") ||
         query.contains("redirect_uri") {
        return true
      }
    }
    // General OAuth 2.0 / OpenID Connect authorization popups
    if (query.contains("client_id=") && (query.contains("redirect_uri=") || query.contains("response_type="))) ||
       path.contains("/oauth/authorize") ||
       path.contains("/oauth2/authorize") {
      return true
    }
    return false
  }

  private func showPopup(_ popup: WKWebView) {
    let container = UIView(frame: bounds)
    container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.backgroundColor = .black

    popup.frame = container.bounds
    popup.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.addSubview(popup)

    let closeButton = UIButton(type: .system)
    closeButton.setTitle("X", for: .normal)
    closeButton.setTitleColor(.white, for: .normal)
    closeButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
    closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.6)
    closeButton.layer.cornerRadius = 20
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(closePopup), for: .touchUpInside)
    container.addSubview(closeButton)

    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor, constant: 8),
      closeButton.trailingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.trailingAnchor, constant: -8),
      closeButton.widthAnchor.constraint(equalToConstant: 40),
      closeButton.heightAnchor.constraint(equalToConstant: 40),
    ])

    addSubview(container)
    popupContainer = container
    popupWebView = popup
  }

  @objc
  private func closePopup() {
    dismissPopup()
  }

  private func dismissPopup() {
    popupWebView?.stopLoading()
    popupWebView?.navigationDelegate = nil
    popupWebView?.uiDelegate = nil
    popupWebView?.removeFromSuperview()
    popupContainer?.removeFromSuperview()
    popupWebView = nil
    popupContainer = nil
    popupCommittedToGoogleOAuth = false
  }

  deinit {
      if let observer = proxyObserver { NotificationCenter.default.removeObserver(observer) }
      NouController.shared.unregister(self)
      dismissPopup()
      webView.removeObserver(self, forKeyPath: "title")
      webView.removeObserver(self, forKeyPath: "url")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    webView.frame = bounds
    popupContainer?.frame = bounds
  }

  func setInspectable(_ inspectable: Bool) {
    if #available(iOS 16.4, *) {
      webView.isInspectable = inspectable
    }
  }

  func setScriptOnStart(_ script: String) {
      if script == scriptOnStart { return }
      scriptOnStart = script
      if let controller = webView?.configuration.userContentController {
        installUserScripts(controller)
      }
  }

  /// Runs [script] before any page script on every navigation, so a page can't
  /// capture the globals it overrides. Takes effect on the next page load.
  func setScriptOnDocumentStart(_ script: String) {
      if script == documentStartScript { return }
      documentStartScript = script
      if let controller = webView?.configuration.userContentController {
        installUserScripts(controller)
      }
  }

  func setProfile(_ profile: String) {
    if profile == currentProfile { return }
    currentProfile = profile
    setupWebView(profile: profile)
  }

  func setTextZoom(_ zoom: Int) {
    self.textZoom = zoom
    if #available(iOS 14.0, *) {
      webView.pageZoom = CGFloat(zoom) / 100.0
    }
  }

  /// Re-installs the document start scripts, picking up the current exceptions.
  /// Takes effect on the next page load, which is what the switch triggers.
  func refreshUserScripts() {
    if let controller = webView?.configuration.userContentController {
      installUserScripts(controller)
    }
  }

  /// A content rule list is attached per web view, so a site the user turned
  /// blocking off for simply keeps the list detached while it is the page host.
  func refreshBlocklist() {
      applyBlocklist(NouController.shared.blocklistRuleList)
  }

  func setBlocklistHost(_ host: String?) {
      guard blocklistHost != host else {
          return
      }
      blocklistHost = host
      refreshBlocklist()
  }

  func applyBlocklist(_ ruleList: WKContentRuleList?) {
      let target = NouController.shared.isBlocklistExcludedHost(blocklistHost) ? nil : ruleList
      guard webView != nil else {
          appliedBlocklistRuleList = target
          return
      }
      let controller = webView.configuration.userContentController
      if let current = appliedBlocklistRuleList {
          controller.remove(current)
      }
      appliedBlocklistRuleList = target
      if let ruleList = target {
          controller.add(ruleList)
      }
  }

  func load(url: String) {
      var targetUrl = url
      if let sourceUrl = URL(string: url), isDesktopFacebookUrl(sourceUrl), sourceUrl.host == "m.facebook.com" {
          targetUrl = url.replacingOccurrences(of: "https://m.facebook.com", with: "https://www.facebook.com", options: .anchored)
      }
      guard let u = URL(string: targetUrl) else { return }
      do { try NoraProxy.shared.snapshot().validateBrowsing() }
      catch {
          proxyRetryURL = u
          reportProxyError()
          return
      }
      // Settle the rule list before the load starts; a change made once a
      // navigation is under way only takes effect on the next one.
      setBlocklistHost(u.host)
      if isDesktopFacebookUrl(u) || isTikTokUrl(u) {
          webView.customUserAgent = uaMac
      } else {
          webView.customUserAgent = userAgent
      }
      var request = URLRequest(url: u)
      webView.load(request)
  }

  // MARK: - KVO
  override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
      if keyPath == "title" || keyPath == "url" {
          onLoad([
            "canGoBack": webView.canGoBack,
            "title": webView.title ?? "",
            "url": webView.url?.absoluteString ?? ""
          ])
      }
  }

  // MARK: - WKScriptMessageHandler
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      if message.name == "NoraI" {
          if let payload = message.body as? String {
               // Emit as a dictionary with payload key to match Android structure
               onMessage([
                   "payload": payload
               ])
          }
      }
  }

  // MARK: - WKNavigationDelegate
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
      do { try NoraProxy.shared.snapshot().validateBrowsing() }
      catch {
          if navigationAction.targetFrame?.isMainFrame != false {
              if webView == self.webView { proxyRetryURL = navigationAction.request.url }
              reportProxyError()
          }
          decisionHandler(.cancel)
          return
      }
      guard let url = navigationAction.request.url else {
          decisionHandler(.allow)
          return
      }

      let urlString = url.absoluteString
      let scheme = url.scheme?.lowercased() ?? ""
      let isInternalScheme = INTERNAL_SCHEMES.contains(scheme)
      let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

      // Attach or detach the rule list before the page loads: a change only
      // takes effect on the next navigation.
      if webView != popupWebView && isMainFrame && !isInternalScheme {
          setBlocklistHost(url.host)
      }

      // `<a download>` clicks, including the `blob:` URLs image generators hand out.
      // WebKit reads the blob itself, so this never goes through the page's CSP.
      if navigationAction.shouldPerformDownload {
          decisionHandler(.download)
          return
      }

      if webView == popupWebView && isMainFrame && !popupCommittedToGoogleOAuth {
          if scheme == "about" {
              decisionHandler(.allow)
              return
          }
          if isGoogleOAuthPopupUrl(url) {
              NouController.shared.log("Popup [OAuth]: committed to OAuth for \(sanitizeUrlForLogging(url))")
              popupCommittedToGoogleOAuth = true
              decisionHandler(.allow)
              return
          }

          NouController.shared.log("Popup [Dismiss]: non-OAuth popup navigation emitted as new-tab for \(sanitizeUrlForLogging(url))")
          emitCustomEvent(type: "new-tab", data: ["url": urlString])
          dismissPopup()
          decisionHandler(.cancel)
          return
      }

      if webView != popupWebView && isMainFrame && isDesktopFacebookUrl(url) && (url.host == "m.facebook.com" || webView.customUserAgent != uaMac) {
          NouController.shared.log("Redirect: Facebook mobile -> desktop for \(sanitizeUrlForLogging(url))")
          decisionHandler(.cancel)
          load(url: urlString)
          return
      }

      if webView != popupWebView && isMainFrame && shouldRedirectFacebookToMobile(currentUrl: webView.url, targetUrl: url, desktopMode: webView.customUserAgent == uaMac) {
          NouController.shared.log("Redirect: Facebook desktop -> mobile for \(sanitizeUrlForLogging(url))")
          let mobileUrl = urlString.replacingOccurrences(of: "https://www.facebook.com", with: "https://m.facebook.com")
          decisionHandler(.cancel)
          load(url: mobileUrl)
          return
      }

      // Redirect to Old Reddit if setting is enabled
      if NouController.shared.settings.redirectToOldReddit && urlString.hasPrefix("https://www.reddit.com/") {
          NouController.shared.log("Redirect: old.reddit.com for \(sanitizeUrlForLogging(url))")
          let oldRedditUrl = urlString.replacingOccurrences(of: "www.reddit.com", with: "old.reddit.com")
          decisionHandler(.cancel)
          load(url: oldRedditUrl)
          return
      }

      if !isInternalScheme {
          if UIApplication.shared.canOpenURL(url) {
              UIApplication.shared.open(url)
          }
          decisionHandler(.cancel)
          return
      }

      let host = url.host ?? ""
      let isFacebook = host.hasSuffix(".facebook.com") && host != "l.facebook.com"

      let isGoogle = host.contains("google.com") || host.contains("gstatic.com") || host.contains("recaptcha.net")
      let dynamicInternalHosts = Set(NouController.shared.settings.internalHosts.map { $0.lowercased() })
      let isDynamicInternalHost = dynamicInternalHosts.contains(host.lowercased())
      let allowedInView =
        VIEW_HOSTS.contains(host) ||
        isDynamicInternalHost ||
        isFacebook ||
        isGoogle ||
        !NouController.shared.settings.openExternalLinkInSystemBrowser

      if webView == popupWebView || allowedInView || !isMainFrame {
          decisionHandler(.allow)
      } else {
          if UIApplication.shared.canOpenURL(url) {
              UIApplication.shared.open(url)
              decisionHandler(.cancel)
          } else {
              decisionHandler(.allow)
          }
      }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
      if let httpResponse = navigationResponse.response as? HTTPURLResponse, httpResponse.statusCode >= 400 {
          NouController.shared.log("HTTP error: statusCode=\(httpResponse.statusCode), url=\(sanitizeUrlForLogging(navigationResponse.response.url))")
      }
      // Attachments and types WebKit can't render would otherwise silently do nothing.
      if !navigationResponse.canShowMIMEType {
          decisionHandler(.download)
          return
      }
      decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
      download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
      download.delegate = self
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      if webView == popupWebView {
          return
      }

      refreshControl.endRefreshing()
      proxyErrorShown = false
      proxyRetryURL = nil

      let url = webView.url?.absoluteString ?? ""
      let title = webView.title ?? ""

      onLoad([
        "canGoBack": webView.canGoBack,
        "url": url,
        "title": title
      ])

      // Signal to fetch icon, matching Android's onReceivedIcon
      emitCustomEvent(type: "icon", data: "")
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      NouController.shared.log("Navigation failed with error: \(error.localizedDescription), url: \(sanitizeUrlForLogging(webView.url))")
      handleProxyLoadError(webView, error: error)
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
      NouController.shared.log("Provisional navigation failed with error: \(error.localizedDescription), url: \(sanitizeUrlForLogging(webView.url))")
      handleProxyLoadError(webView, error: error)
  }

  private func handleProxyLoadError(_ failedView: WKWebView, error: Error) {
      refreshControl.endRefreshing()
      guard NoraProxy.shared.snapshot().enabled, (error as NSError).code != NSURLErrorCancelled else { return }
      if failedView == webView {
          let failingURL = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL
          proxyRetryURL = failingURL ?? failedView.url ?? proxyRetryURL
      }
      reportProxyError()
  }

  func download(url: String, fileName: String?, mimeType: String?) {
      guard let u = URL(string: url) else { return }
      UIApplication.shared.open(u)
  }

  func saveFile(content: String, fileName: String, mimeType: String?) {
      guard let data = Data(base64Encoded: content) else { return }

      let fileManager = FileManager.default
      let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
      let fileUrl = docs.appendingPathComponent(fileName)

      do {
          try data.write(to: fileUrl)
           NouController.shared.log("Saved file to \(fileUrl.path)")
          presentSavedFile(fileUrl)
      } catch {
           NouController.shared.log("Failed to save file: \(error)")
      }
  }

  /// Let the user pick where a saved file ends up, iOS has no shared Downloads folder.
  private func presentSavedFile(_ fileUrl: URL) {
      DispatchQueue.main.async {
          let activityVC = UIActivityViewController(activityItems: [fileUrl], applicationActivities: nil)
          if let topVC = UIApplication.shared.keyWindow?.rootViewController {
               activityVC.popoverPresentationController?.sourceView = self
               topVC.present(activityVC, animated: true, completion: nil)
          }
      }
  }

  // MARK: - WKDownloadDelegate

  func download(
    _ download: WKDownload,
    decideDestinationUsing response: URLResponse,
    suggestedFilename: String,
    completionHandler: @escaping (URL?) -> Void
  ) {
      // WKDownload requires a path that doesn't exist yet, so give each one its own directory.
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
      do {
          try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      } catch {
          NouController.shared.log("Failed to prepare download directory: \(error)")
          completionHandler(nil)
          return
      }

      let name = suggestedFilename.isEmpty ? "download" : suggestedFilename
      let fileUrl = directory.appendingPathComponent(name)
      downloadDestinations[download] = fileUrl
      completionHandler(fileUrl)
  }

  func downloadDidFinish(_ download: WKDownload) {
      guard let fileUrl = downloadDestinations.removeValue(forKey: download) else { return }
      NouController.shared.log("Downloaded file to \(fileUrl.path)")
      presentSavedFile(fileUrl)
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
      downloadDestinations.removeValue(forKey: download)
      NouController.shared.log("Download failed: \(error)")
  }

  // MARK: - UIScrollViewDelegate
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
      let translation = scrollView.panGestureRecognizer.translation(in: nil).y

      emitCustomEvent(type: "scroll", data: ["dy": translation, "y": scrollView.contentOffset.y])
  }

  @objc
  func handleContextMenuLongPress(_ recognizer: UILongPressGestureRecognizer) {
      if recognizer.state == .began {
          lastContextMenuLocation = recognizer.location(in: webView)
      }
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
      true
  }

  private func resolveContextMenuTargets(
    elementInfo: WKContextMenuElementInfo,
    completion: @escaping (_ linkUrl: String?, _ imageUrl: String?) -> Void
  ) {
      let fallbackLinkUrl = elementInfo.linkURL?.absoluteString
      guard let location = lastContextMenuLocation else {
          completion(fallbackLinkUrl, nil)
          return
      }

      let script = """
        (() => {
          const element = document.elementFromPoint(\(location.x), \(location.y));
          const image = element?.closest?.('img');
          const link = element?.closest?.('a[href]');
          return JSON.stringify({
            imageUrl: image ? (image.currentSrc || image.src || null) : null,
            linkUrl: link ? link.href : null
          });
        })();
      """

      webView.evaluateJavaScript(script) { result, error in
          var linkUrl = fallbackLinkUrl
          var imageUrl: String?

          if
            error == nil,
            let payload = result as? String,
            let data = payload.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
          {
              if let resolvedLinkUrl = json["linkUrl"] as? String, !resolvedLinkUrl.isEmpty {
                  linkUrl = resolvedLinkUrl
              }
              if let resolvedImageUrl = json["imageUrl"] as? String, !resolvedImageUrl.isEmpty {
                  imageUrl = resolvedImageUrl
              }
          }

          completion(linkUrl, imageUrl)
      }
  }

  func emitCustomEvent(type: String, data: Any) {
     let payload: [String: Any] = ["type": type, "data": data]
     onMessage([
        "payload": payload
     ])
  }

  // MARK: - WKUIDelegate
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
      guard navigationAction.targetFrame == nil else {
          return nil
      }

      var startsAsGoogleOAuth = false
      if let url = navigationAction.request.url {
          let scheme = url.scheme?.lowercased() ?? ""
          if scheme != "about" && !isGoogleOAuthPopupUrl(url) {
              NouController.shared.log("Popup [NewTab]: non-OAuth popup emitted as new-tab for \(sanitizeUrlForLogging(url))")
              emitCustomEvent(type: "new-tab", data: ["url": url.absoluteString])
              return nil
          }
          startsAsGoogleOAuth = isGoogleOAuthPopupUrl(url)
      }

      NouController.shared.log("Popup [OAuth]: permitted overlay popup, url=\(sanitizeUrlForLogging(navigationAction.request.url))")
      dismissPopup()
      let popup = WKWebView(frame: bounds, configuration: configuration)
      popup.navigationDelegate = self
      popup.uiDelegate = self
      popup.allowsBackForwardNavigationGestures = true
      if let ua = userAgent {
          popup.customUserAgent = ua
      }
      showPopup(popup)
      popupCommittedToGoogleOAuth = startsAsGoogleOAuth
      return popup
  }

  func webViewDidClose(_ webView: WKWebView) {
      if webView == popupWebView {
          NouController.shared.log("Popup [Close]: closing popup overlay")
          dismissPopup()
      }
  }

  @available(iOS 15.0, *)
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
      decisionHandler(.grant)
  }

  @available(iOS 13.0, *)
  func webView(
    _ webView: WKWebView,
    contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
    completionHandler: @escaping (UIContextMenuConfiguration?) -> Void
  ) {
      resolveContextMenuTargets(elementInfo: elementInfo) { [weak self] linkUrl, imageUrl in
          guard let self = self else {
              completionHandler(nil)
              return
          }
          guard linkUrl != nil || imageUrl != nil else {
              completionHandler(nil)
              return
          }

          let configuration = UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { suggestedActions in
              var actions = [UIMenuElement]()

              if let imageUrl = imageUrl {
                  let openImageInNewTab = UIAction(
                    title: NouController.shared.t("menu_openImageInNewTab"),
                    image: UIImage(systemName: "photo.on.rectangle")
                  ) { [weak self] _ in
                      self?.emitCustomEvent(type: "new-tab", data: ["url": imageUrl, "kind": "image"])
                  }
                  actions.append(openImageInNewTab)
              }

              if let linkUrl = linkUrl, linkUrl != imageUrl {
                  let openInNewTab = UIAction(
                    title: NouController.shared.t("menu_openInNewTab"),
                    image: UIImage(systemName: "plus.square.on.square")
                  ) { [weak self] _ in
                      self?.emitCustomEvent(type: "new-tab", data: ["url": linkUrl])
                  }
                  actions.append(openInNewTab)

                  let openInProfile = UIAction(
                    title: NouController.shared.t("menu_openInProfile"),
                    image: UIImage(systemName: "person.crop.circle")
                  ) { [weak self] _ in
                      self?.emitCustomEvent(type: "open-in-profile", data: ["url": linkUrl])
                  }
                  actions.append(openInProfile)
              }

              return UIMenu(title: "", children: actions + suggestedActions)
          }

          completionHandler(configuration)
      }
  }
}
