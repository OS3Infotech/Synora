import type { WatchFetchResult, WatchMedia, WatchPost, WatchSite } from '../types'
import { decodeEntities, htmlAttribute, htmlToText } from '../html'
import { parseRssDate } from './nitter'

export const blogRssUrl = (site: WatchSite, handle: string): string => {
  switch (site) {
    case 'medium':
      return `https://medium.com/feed/${handle}`
    case 'substack':
      if (handle.startsWith('@')) return `https://substack.com/feed/${handle}`
      if (handle.includes('/s/')) {
        const [sub, ...rest] = handle.split('/')
        return `https://${sub}.substack.com/${rest.join('/')}/feed`
      }
      return `https://${handle}.substack.com/feed`
    case 'wordpress':
      if (handle.includes('/')) {
        const [sub, ...rest] = handle.split('/')
        const domain = sub.includes('.') ? sub : `${sub}.wordpress.com`
        return `https://${domain}/${rest.join('/')}/feed`
      }
      return handle.includes('.') ? `https://${handle}/feed` : `https://${handle}.wordpress.com/feed`
    case 'rss':
      return /^https?:\/\//i.test(handle) ? handle : `https://${handle}`
    default:
      return handle
  }
}

export const xmlField = (xml: string, tag: string): string | undefined => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!match) return undefined
  const cdata = match[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return cdata ? cdata[1] : decodeEntities(match[1])
}

export const parseBlogDate = (raw?: string): number => {
  if (!raw) return 0
  const trimmed = raw.trim()
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) return parsed
  return parseRssDate(trimmed) || 0
}

export const extractFeedImage = (itemXml: string): string | undefined => {
  const enclosureMatch = itemXml.match(/<enclosure\b[^>]*>/i)
  if (enclosureMatch) {
    const tag = enclosureMatch[0]
    const type = htmlAttribute(tag, 'type')
    const url = htmlAttribute(tag, 'url')
    if (url && (!type || type.startsWith('image/'))) return url
  }

  const mediaMatch = itemXml.match(/<media:(?:content|thumbnail)\b[^>]*>/i)
  if (mediaMatch) {
    const url = htmlAttribute(mediaMatch[0], 'url')
    if (url) return url
  }

  const imgMatch = itemXml.match(/<img\b[^>]*>/i)
  if (imgMatch) {
    const src = htmlAttribute(imgMatch[0], 'src')
    if (src && !src.startsWith('data:') && !/[/?]pixel|[/?]stat\b/i.test(src)) {
      return src
    }
  }

  return undefined
}

export const cleanExcerpt = (text: string, maxLen = 300): string => {
  if (!text) return ''
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLen) return cleaned
  return `${cleaned.slice(0, maxLen).trim()}…`
}

/** Formats article title and body excerpt for display in the feed. */
export const formatArticleText = (title?: string, contentOrSummary?: string): string => {
  const cleanTitle = title ? decodeEntities(title).trim() : ''
  const rawExcerpt = contentOrSummary ? htmlToText(contentOrSummary) : ''
  const cleanSummary = cleanExcerpt(rawExcerpt)

  if (cleanTitle && cleanSummary) {
    if (cleanSummary.startsWith(cleanTitle)) {
      return cleanSummary
    }
    return `${cleanTitle}\n\n${cleanSummary}`
  }
  return cleanTitle || cleanSummary || ''
}

export function parseBlogFeed(xml: string, site: WatchSite, handle: string): WatchFetchResult {
  const isAtom = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml) || /<feed\b[^>]*>/i.test(xml)
  return isAtom ? parseAtomFeed(xml, site, handle) : parseRss2Feed(xml, site, handle)
}

function parseRss2Feed(xml: string, site: WatchSite, handle: string): WatchFetchResult {
  const channel = xml.match(/<channel\b[^>]*>([\s\S]*?)(?:<item\b|<\/channel>)/i)?.[1] || ''
  const channelTitle = xmlField(channel, 'title')
  const channelAvatar =
    xmlField(channel.match(/<image\b[\s\S]*?<\/image>/i)?.[0] || '', 'url') ||
    htmlAttribute(channel.match(/<itunes:image\b[^>]*>/i)?.[0] || '', 'href')

  const posts: WatchFetchResult['posts'] = []

  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const link = (xmlField(item, 'link') || htmlAttribute(item.match(/<link\b[^>]*>/i)?.[0] || '', 'href') || '').trim()
    const guid = (xmlField(item, 'guid') || '').trim()
    const id = guid || link
    if (!id && !link) continue

    const title = xmlField(item, 'title')
    const rawContent = xmlField(item, 'content:encoded') || xmlField(item, 'content') || xmlField(item, 'description')
    const text = formatArticleText(title, rawContent)
    const pubDate = xmlField(item, 'pubDate') || xmlField(item, 'dc:date')
    const createdAtMs = parseBlogDate(pubDate) || Date.now()

    const imageUrl = extractFeedImage(item)
    const media: WatchMedia[] | undefined = imageUrl ? [{ type: 'image', url: imageUrl }] : undefined

    posts.push({
      id: id || `${createdAtMs}`,
      site,
      handle,
      url: link || guid,
      text,
      image: imageUrl,
      media,
      mediaComplete: true,
      createdAtMs,
    })
  }

  return {
    info: {
      name: channelTitle?.trim() || undefined,
      avatar: channelAvatar?.trim() || undefined,
    },
    posts,
  }
}

function parseAtomFeed(xml: string, site: WatchSite, handle: string): WatchFetchResult {
  const feedHeader = xml.match(/<feed\b[^>]*>([\s\S]*?)(?:<entry\b|<\/feed>)/i)?.[1] || ''
  const feedTitle = xmlField(feedHeader, 'title')
  const feedAvatar = xmlField(feedHeader, 'icon') || xmlField(feedHeader, 'logo')

  const posts: WatchFetchResult['posts'] = []

  for (const [, entry] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const linkMatch =
      entry.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']*)["']/i) ||
      entry.match(/<link\b[^>]*\bhref=["']([^"']*)["'][^>]*\brel=["']alternate["']/i) ||
      entry.match(/<link\b[^>]*\bhref=["']([^"']*)["']/i)

    const link = linkMatch ? decodeEntities(linkMatch[1]).trim() : (xmlField(entry, 'link') || '').trim()
    const id = (xmlField(entry, 'id') || link).trim()
    if (!id && !link) continue

    const title = xmlField(entry, 'title')
    const rawContent = xmlField(entry, 'content') || xmlField(entry, 'summary')
    const text = formatArticleText(title, rawContent)
    const published = xmlField(entry, 'published') || xmlField(entry, 'updated')
    const createdAtMs = parseBlogDate(published) || Date.now()

    const imageUrl = extractFeedImage(entry)
    const media: WatchMedia[] | undefined = imageUrl ? [{ type: 'image', url: imageUrl }] : undefined

    posts.push({
      id: id || `${createdAtMs}`,
      site,
      handle,
      url: link || id,
      text,
      image: imageUrl,
      media,
      mediaComplete: true,
      createdAtMs,
    })
  }

  return {
    info: {
      name: feedTitle?.trim() || undefined,
      avatar: feedAvatar?.trim() || undefined,
    },
    posts,
  }
}

/** Finds an RSS/Atom link in HTML for auto-discovery. */
export const discoverRssFeedUrl = (html: string, baseUrl: string): string | null => {
  const match =
    html.match(/<link\b[^>]*\btype=["'](application\/(?:rss\+xml|atom\+xml)|text\/xml)["'][^>]*>/i) ||
    html.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\btype=["'](application\/(?:rss\+xml|atom\+xml)|text\/xml)["'][^>]*>/i)
  if (!match) return null
  const href = htmlAttribute(match[0], 'href')
  if (!href) return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}

