package expo.modules.noraview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FacebookUrlTest {
  @Test
  fun detectsMessengerAndMarketplacePathsOnFacebookHosts() {
    assertTrue(isMessengerUrl("https://www.facebook.com/messages"))
    assertTrue(isMessengerUrl("https://m.facebook.com/messages/t/123/"))
    assertTrue(isMarketplaceUrl("https://www.facebook.com/marketplace"))
    assertTrue(isMarketplaceUrl("https://m.facebook.com/marketplace/item/123456/"))
    assertTrue(isDesktopFacebookUrl("https://m.facebook.com/marketplace/item/123456/"))

    assertFalse(isMarketplaceUrl("https://m.facebook.com/marketplace-other"))
    assertFalse(isMarketplaceUrl("http://m.facebook.com/marketplace/"))
    assertFalse(isMarketplaceUrl("https://example.com/marketplace/"))
  }

  @Test
  fun rewritesMobileFacebookUrlToDesktop() {
    assertEquals(
      "https://www.facebook.com/marketplace/item/123456/?ref=search",
      desktopFacebookUrl("https://m.facebook.com/marketplace/item/123456/?ref=search"),
    )
    assertEquals(
      "https://www.facebook.com/messages/",
      desktopFacebookUrl("https://m.facebook.com/messages/"),
    )
  }

  @Test
  fun keepsMarketplaceAndMessengerOnDesktopWithoutStuckDesktopFeed() {
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/marketplace/item/123456/",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/messages/",
        desktopMode = false,
      ),
    )
    assertTrue(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://www.facebook.com/marketplace/item/123456/",
        targetUrl = "https://www.facebook.com/",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://www.facebook.com/messages/t/123/",
        targetUrl = "https://www.facebook.com/photo/?fbid=1",
        desktopMode = false,
      ),
    )
  }

  @Test
  fun neverRewritesFacebookAuthLoginCheckpointOrSecurityRoutes() {
    // Login routes
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/login.php",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/login/",
        desktopMode = false,
      ),
    )
    // OAuth dialog routes
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/dialog/oauth?client_id=123456&redirect_uri=https%3A%2F%2Finstagram.com",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/v18.0/dialog/oauth?client_id=123",
        desktopMode = false,
      ),
    )
    // Checkpoint routes
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2F",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://www.facebook.com/checkpoint/",
        targetUrl = "https://www.facebook.com/checkpoint/123/",
        desktopMode = false,
      ),
    )
    // Two-factor authentication & security verification
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/two_step_verification/two_factor/",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/security/2fa/",
        desktopMode = false,
      ),
    )
    assertFalse(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://www.facebook.com/checkpoint/",
        targetUrl = "https://www.facebook.com/recover/initiate/",
        desktopMode = false,
      ),
    )

    // Ordinary browsing on Facebook continues to be redirected to mobile
    assertTrue(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/",
        desktopMode = false,
      ),
    )
    assertTrue(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/zuck",
        desktopMode = false,
      ),
    )
    assertTrue(
      shouldRedirectFacebookToMobile(
        currentUrl = "https://m.facebook.com/",
        targetUrl = "https://www.facebook.com/groups/feed/",
        desktopMode = false,
      ),
    )
  }

  @Test
  fun correctlyIdentifiesFacebookOAuthAndAuthPopupUrls() {
    // Facebook OAuth dialogs and login popups
    assertTrue(isGoogleOAuthPopupUrl("https://www.facebook.com/dialog/oauth?client_id=123&redirect_uri=https%3A%2F%2Fexample.com"))
    assertTrue(isGoogleOAuthPopupUrl("https://www.facebook.com/v18.0/dialog/oauth?client_id=123&redirect_uri=https%3A%2F%2Fexample.com"))
    assertTrue(isGoogleOAuthPopupUrl("https://m.facebook.com/login.php?skip_api_login=1&api_key=123"))
    assertTrue(isGoogleOAuthPopupUrl("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fexample.com"))

    // Instagram OAuth and login popups
    assertTrue(isGoogleOAuthPopupUrl("https://www.instagram.com/accounts/login/?next=/oauth/"))
    assertTrue(isGoogleOAuthPopupUrl("https://api.instagram.com/oauth/authorize?client_id=abc&redirect_uri=xyz"))

    // Google, LinkedIn, X, Apple OAuth popups
    assertTrue(isGoogleOAuthPopupUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=xyz"))
    assertTrue(isGoogleOAuthPopupUrl("https://www.linkedin.com/uas/connect/google?session_redirect=https%3A%2F%2Flinkedin.com"))
    assertTrue(isGoogleOAuthPopupUrl("https://x.com/i/flow/login"))
    assertTrue(isGoogleOAuthPopupUrl("https://appleid.apple.com/auth/authorize"))

    // General OAuth
    assertTrue(isGoogleOAuthPopupUrl("https://auth.example.com/oauth/authorize?client_id=123&redirect_uri=https%3A%2F%2Fapp.com&response_type=code"))

    // Normal browsing must NOT be treated as OAuth popups
    assertFalse(isGoogleOAuthPopupUrl("https://www.facebook.com/"))
    assertFalse(isGoogleOAuthPopupUrl("https://m.facebook.com/home.php"))
    assertFalse(isGoogleOAuthPopupUrl("https://www.google.com/search?q=synora"))
    assertFalse(isGoogleOAuthPopupUrl("https://www.instagram.com/p/abc123/"))
  }
}
