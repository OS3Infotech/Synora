import { describe, expect, it } from 'bun:test'
import {
  blogRssUrl,
  discoverRssFeedUrl,
  extractFeedImage,
  formatArticleText,
  parseBlogDate,
  parseBlogFeed,
} from './blog'

describe('blogRssUrl', () => {
  it('formats feed URLs for Medium, Substack, WordPress, and RSS', () => {
    expect(blogRssUrl('medium', '@paulg')).toBe('https://medium.com/feed/@paulg')
    expect(blogRssUrl('medium', 'towards-data-science')).toBe('https://medium.com/feed/towards-data-science')
    expect(blogRssUrl('medium', 'tag/artificial-intelligence')).toBe('https://medium.com/feed/tag/artificial-intelligence')
    expect(blogRssUrl('substack', 'astralcodexten')).toBe('https://astralcodexten.substack.com/feed')
    expect(blogRssUrl('substack', 'astralcodexten/s/ai')).toBe('https://astralcodexten.substack.com/s/ai/feed')
    expect(blogRssUrl('substack', '@author')).toBe('https://substack.com/feed/@author')
    expect(blogRssUrl('wordpress', 'techcrunch')).toBe('https://techcrunch.wordpress.com/feed')
    expect(blogRssUrl('wordpress', 'techcrunch/tag/ai')).toBe('https://techcrunch.wordpress.com/tag/ai/feed')
    expect(blogRssUrl('wordpress', 'blog.example.com')).toBe('https://blog.example.com/feed')
    expect(blogRssUrl('rss', 'https://daringfireball.net/feeds/main')).toBe('https://daringfireball.net/feeds/main')
  })
})

describe('parseBlogDate', () => {
  it('reads RFC 822/1123 dates and ISO 8601 dates', () => {
    expect(parseBlogDate('Wed, 18 Nov 2026 08:00:00 GMT')).toBe(1794988800000)
    expect(parseBlogDate('2026-11-18T08:00:00Z')).toBe(1794988800000)
  })
})

describe('discoverRssFeedUrl', () => {
  it('finds rss+xml link in HTML', () => {
    const html = `
      <html>
        <head>
          <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml" />
        </head>
      </html>
    `
    expect(discoverRssFeedUrl(html, 'https://example.com')).toBe('https://example.com/feed.xml')
  })

  it('finds atom+xml link in HTML', () => {
    const html = `
      <html>
        <head>
          <link rel="alternate" type="application/atom+xml" href="https://example.com/atom" />
        </head>
      </html>
    `
    expect(discoverRssFeedUrl(html, 'https://example.com')).toBe('https://example.com/atom')
  })

  it('returns null if no feed link exists', () => {
    expect(discoverRssFeedUrl('<html><head></head></html>', 'https://example.com')).toBeNull()
  })
})

describe('parseBlogFeed', () => {
  it('parses Medium RSS 2.0 feeds with CDATA and images', () => {
    const mediumXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
        <channel>
          <title><![CDATA[Stories by Paul G on Medium]]></title>
          <link>https://medium.com/@paulg</link>
          <image>
            <url>https://cdn-images-1.medium.com/fit/c/150/150/avatar.jpg</url>
            <title>Stories by Paul G</title>
            <link>https://medium.com/@paulg</link>
          </image>
          <item>
            <title><![CDATA[How to Build Things]]></title>
            <link>https://medium.com/@paulg/how-to-build-things-12345</link>
            <guid isPermaLink="false">https://medium.com/p/12345</guid>
            <dc:creator><![CDATA[Paul G]]></dc:creator>
            <pubDate>Wed, 18 Nov 2026 08:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<figure><img src="https://miro.medium.com/v2/resize:fit:1400/hero.jpg"/></figure><p>The first rule of building is to start small.</p>]]></content:encoded>
          </item>
        </channel>
      </rss>
    `

    const result = parseBlogFeed(mediumXml, 'medium', '@paulg')
    expect(result.info.name).toBe('Stories by Paul G on Medium')
    expect(result.info.avatar).toBe('https://cdn-images-1.medium.com/fit/c/150/150/avatar.jpg')
    expect(result.posts).toHaveLength(1)

    const post = result.posts[0]
    expect(post.site).toBe('medium')
    expect(post.handle).toBe('@paulg')
    expect(post.url).toBe('https://medium.com/@paulg/how-to-build-things-12345')
    expect(post.text).toContain('How to Build Things')
    expect(post.text).toContain('The first rule of building is to start small.')
    expect(post.image).toBe('https://miro.medium.com/v2/resize:fit:1400/hero.jpg')
    expect(post.media).toEqual([{ type: 'image', url: 'https://miro.medium.com/v2/resize:fit:1400/hero.jpg' }])
    expect(post.createdAtMs).toBe(1794988800000)
  })

  it('parses Substack RSS feeds with enclosure images', () => {
    const substackXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Astral Codex Ten</title>
          <link>https://astralcodexten.substack.com</link>
          <item>
            <title>Book Review: Something</title>
            <link>https://astralcodexten.substack.com/p/book-review</link>
            <guid>https://astralcodexten.substack.com/p/book-review</guid>
            <pubDate>Wed, 18 Nov 2026 08:00:00 GMT</pubDate>
            <description>This is a thorough review of the book.</description>
            <enclosure url="https://substackcdn.com/image/hero.png" type="image/png" />
          </item>
        </channel>
      </rss>
    `

    const result = parseBlogFeed(substackXml, 'substack', 'astralcodexten')
    expect(result.info.name).toBe('Astral Codex Ten')
    expect(result.posts).toHaveLength(1)

    const post = result.posts[0]
    expect(post.site).toBe('substack')
    expect(post.handle).toBe('astralcodexten')
    expect(post.image).toBe('https://substackcdn.com/image/hero.png')
    expect(post.text).toContain('Book Review: Something')
    expect(post.text).toContain('This is a thorough review of the book.')
  })

  it('parses Atom 1.0 feeds', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Engineering Blog</title>
        <link href="https://blog.example.com"/>
        <icon>https://blog.example.com/icon.png</icon>
        <entry>
          <title>Release 3.0</title>
          <link rel="alternate" href="https://blog.example.com/release-3"/>
          <id>urn:uuid:12345</id>
          <updated>2026-11-18T08:00:00Z</updated>
          <summary>We are thrilled to announce v3.0.</summary>
        </entry>
      </feed>
    `

    const result = parseBlogFeed(atomXml, 'rss', 'https://blog.example.com/feed')
    expect(result.info.name).toBe('Engineering Blog')
    expect(result.info.avatar).toBe('https://blog.example.com/icon.png')
    expect(result.posts).toHaveLength(1)

    const post = result.posts[0]
    expect(post.site).toBe('rss')
    expect(post.url).toBe('https://blog.example.com/release-3')
    expect(post.text).toContain('Release 3.0')
    expect(post.text).toContain('We are thrilled to announce v3.0.')
    expect(post.createdAtMs).toBe(1794988800000)
  })
})

