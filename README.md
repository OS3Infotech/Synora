# <img src="desktop/icon.png" align="top" height="44"> AIPulse

> **Stay Connected to the Pulse of AI.**

A modern intelligence and feed platform designed to keep you updated on the latest AI breakthroughs, discussions, research, and insights across social networks and publishing platforms. Available on Desktop (Linux, macOS, Windows), Android, and iOS.

[<img src="https://img.shields.io/badge/App_Store-0D96F6?style=for-the-badge&logo=app-store&logoColor=white"
      alt="Get it on App Store"
      height="50">](https://apps.apple.com/us/app/nora-sns-browser/id6758549275)
[<img src="https://img.shields.io/badge/Google_Play-01875f?style=for-the-badge&logo=google-play"
      alt="Get it on Google Play"
      hspace="16"
      height="50">](https://play.google.com/store/apps/details?id=jp.nonbili.nora)
[<img src="https://img.shields.io/badge/F--Droid-1976D2?style=for-the-badge&logo=f-droid"
      alt="Get it on F-Droid"
      height="50">](https://f-droid.org/packages/jp.nonbili.nora/)
[<img src="https://img.shields.io/badge/GitHub%20Releases-100000?style=for-the-badge&logo=github"
      alt="Get it on GitHub"
      hspace="16"
      height="50">](https://github.com/nonbili/Nora/releases/latest)

AIPulse Desktop features a deck view to easily browse multiple timelines side-by-side. Linux, macOS, and Windows versions are available.

## Features

- **Unified Intelligence Feed:** Aggregate posts, articles, and newsletters from social media, blogging platforms, and RSS feeds in one organized stream.
- **Platform Feed Filter:** Quickly filter feeds by platform with one tap (All, X, Bluesky, Mastodon, Threads, Reddit, Facebook, Instagram, TikTok, Medium, Substack, WordPress, RSS).
- **Deep Topic & Tag Watching:** Follow topics, tags, and publications directly (e.g. `https://medium.com/tag/artificial-intelligence`, Substack sections, WordPress categories, and RSS/Atom feeds).
- **Deck & Multi-timeline View:** Browse multiple feeds, profiles, and timelines side-by-side on desktop.
- **No Ads & Built-in Blocklist:** Clean reading experience with built-in ad guard and EasyList/EasyPrivacy blocklists.
- **Multiple Accounts:** Separate cookie storage per profile for managing multiple accounts cleanly.
- **Anonymous Mode:** Hide sign-in and open-in-app prompts on Facebook, Instagram, Threads, Tumblr, and X; read without an account.
- **Search Public Posts:** Search public discussions and posts without signing in (via DuckDuckGo).
- **Media Download:** Save images and videos from supported platforms directly.
- **Customization & Dark Mode:** Custom CSS styling, dark/light themes, zoom control, and configurable refresh intervals.

## Supported Platforms

### Social Networks
- **X (Twitter)**
- **Bluesky**
- **Mastodon**
- **Threads**
- **Reddit**
- **LinkedIn**
- **Facebook**
- **Instagram**
- **TikTok**
- **Tumblr**
- **VK**

### Publishing & Blogging Platforms
- **Medium:** User profiles (`@username`), publications (`publication.com`), and topics/tags (`medium.com/tag/artificial-intelligence`).
- **Substack:** Newsletters, author profiles, and publication sections (`publication.substack.com`, custom domains).
- **WordPress:** Self-hosted and WordPress.com blogs, tags, and category feeds.
- **RSS & Atom:** Direct support for standard RSS 2.0 and Atom 1.0 feeds (AI research blogs, tech newsletters, publication feeds).

## Getting Started

### Desktop Development

```sh
# Run desktop in development mode
cd desktop
bun run dev
```

### Production Build

```sh
# Bundle web assets
bun run bundle

# Build desktop application
cd desktop
bun run build

# Start preview
bun run start
```

### Running Tests

Run the full test suite with Bun:

```sh
bun test
```

## Screenshots

<img src="metadata/en-US/images/phoneScreenshots/1.png" width="240" alt="Social browser home"> <img src="metadata/en-US/images/phoneScreenshots/2.png" width="240" alt="Feed timeline"> <img src="metadata/en-US/images/phoneScreenshots/3.png" width="240" alt="Photo and video grid">

<img src="metadata/en-US/images/phoneScreenshots/4.png" width="240" alt="Manage feed sources"> <img src="metadata/en-US/images/phoneScreenshots/5.png" width="240" alt="Profiles and sessions"> <img src="metadata/en-US/images/phoneScreenshots/6.png" width="240" alt="Tabs">

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and testing instructions.

## Translation

Translation is supported by [Weblate](https://hosted.weblate.org/projects/nora).
