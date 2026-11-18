import { blogRssUrl, discoverRssFeedUrl, parseBlogFeed } from '../sites/blog'
import type { WatchFetchResult, WatchSite } from '../types'
import { fetchText, type WatchRunSource } from './common'
import type { SiteAccount } from '../../watch-account'

export const fetchBlog = async (
  site: WatchSite,
  handle: string,
  _cookie: string,
  _source: WatchRunSource,
  deadline: number,
  _account?: SiteAccount | null,
): Promise<WatchFetchResult> => {
  const feedUrl = blogRssUrl(site, handle)
  const headers = {
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*',
  }
  let body = await fetchText(feedUrl, headers, deadline)

  // If this is a generic blog or website that returned HTML, attempt RSS auto-discovery
  if (site === 'rss' && (body.includes('<html') || body.includes('<!DOCTYPE html') || body.includes('<!doctype html'))) {
    const discovered = discoverRssFeedUrl(body, feedUrl)
    if (discovered && discovered !== feedUrl) {
      body = await fetchText(discovered, headers, deadline)
    }
  }

  return parseBlogFeed(body, site, handle)
}

export const fetchMedium = (handle: string, cookie: string, source: WatchRunSource, deadline: number, account?: SiteAccount | null) =>
  fetchBlog('medium', handle, cookie, source, deadline, account)

export const fetchSubstack = (handle: string, cookie: string, source: WatchRunSource, deadline: number, account?: SiteAccount | null) =>
  fetchBlog('substack', handle, cookie, source, deadline, account)

export const fetchWordpress = (handle: string, cookie: string, source: WatchRunSource, deadline: number, account?: SiteAccount | null) =>
  fetchBlog('wordpress', handle, cookie, source, deadline, account)

export const fetchRss = (handle: string, cookie: string, source: WatchRunSource, deadline: number, account?: SiteAccount | null) =>
  fetchBlog('rss', handle, cookie, source, deadline, account)
