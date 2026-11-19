# <img src="desktop/icon.png" align="top" height="44"> Synora

> **Everything connected in one intelligent space. Premium, modern, brandable.**

A modern intelligence workspace and multi-platform feed browser designed to keep you seamlessly connected to the latest AI breakthroughs, daily updates, discussions, research, and publications. Available on Desktop (**Linux, macOS, Windows**), Web, Android, and iOS.

---

## Highlights

- **Unified AI & Intelligence Hub:** Direct access to frontier AI updates and tools like **Staying Ahead AI**, ChatGPT, Claude, Perplexity, and Gemini, alongside curated newsfeeds and newsletters.
- **Deck & Multi-Timeline View:** Browse multiple feeds, profiles, and timelines side-by-side on desktop with intuitive multi-tab and split-deck workspaces.
- **Distraction-Free & Privacy-Focused:** Built-in ad guard, tracker protection (EasyList & EasyPrivacy), and anonymous reading modes for platforms like Facebook, Instagram, Threads, and X.
- **Multi-Profile Isolation:** Separate cookie storage, cache, and authentication sessions per profile—switch accounts cleanly with zero interference.
- **Deep Topic & Tag Watching:** Follow topics, tags, and publications directly (e.g. `https://stayingahead.ai/daily-ai-updates`, Medium tags, Substack publications, WordPress categories, and RSS/Atom feeds).
- **Native Cross-Platform Performance:** Lightweight, fluid, and optimized for desktop operating systems (Linux, Windows, macOS) and web browsers.

---

## Supported Platforms

### AI & Intelligence Hubs
- **Staying Ahead AI:** Direct daily AI dispatches and updates (`https://stayingahead.ai/daily-ai-updates`).
- **Frontier AI Models:** Quick-access preset bookmarks and workspace tabs for ChatGPT, Claude, Perplexity, and Gemini.

### Social Networks
- **LinkedIn** (with streamlined Google OAuth login support)
- **X (Twitter)**
- **Bluesky**
- **Mastodon**
- **Threads**
- **Reddit**
- **Facebook**
- **Instagram**
- **TikTok**
- **Tumblr**
- **VK**

### Publishing, Blogs & RSS
- **Medium:** User profiles (`@username`), publications, and topics/tags (`medium.com/tag/artificial-intelligence`).
- **Substack:** Newsletters, author profiles, and publication sections (`publication.substack.com`, custom domains).
- **WordPress:** Self-hosted and WordPress.com blogs, tags, and category feeds.
- **RSS & Atom:** Direct support for standard RSS 2.0 and Atom 1.0 feeds (AI research blogs, tech newsletters, publication feeds).

---

## Installation & Setup

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: v20 or higher
- **Bun**: v1.1 or higher ([Install Bun](https://bun.sh))
- **Git**

---

### 1. Clone the Repository

```bash
git clone https://github.com/OS3Infotech/Synora.git
cd Synora
```

---

### 2. Install Dependencies

Install root workspace and desktop dependencies:

```bash
# Link local packages and install dependencies
bun link
bun install

# Bundle browser content scripts
bun run bundle
```

---

### 3. Development Mode

#### Running Desktop (Electron)
Launch the desktop application with live reload:

```bash
cd desktop
bun run dev
```

#### Running Web (Expo)
Start the web development server:

```bash
bun run start
# Press 'w' to open in browser
```

---

### 4. How to Package & Install for Desktop

Synora uses `electron-builder` to produce native installers for all major desktop platforms.

#### Linux (`.AppImage` / `.snap`)
To package Synora for Linux:

```bash
cd desktop
bun run build:linux
```
*Generated installers are located in `desktop/dist/` (`Synora-0.9.2.AppImage`, `synora_0.9.2_amd64.snap`).*

To install/run the `.AppImage`:
```bash
chmod +x desktop/dist/Synora-*.AppImage
./desktop/dist/Synora-*.AppImage
```

#### Windows (`.exe` / `.appx`)
To package Synora for Windows (NSIS installer or AppX):

```bash
cd desktop
bun run build:win
```
*Generated installer is located in `desktop/dist/` (`Synora-0.9.2-setup.exe`). Double-click the `.exe` to install.*

#### macOS (`.dmg` / `.zip`)
To package Synora for macOS:

```bash
cd desktop
bun run build:mac
```
*Generated installer is located in `desktop/dist/` (`Synora-0.9.2-arm64.dmg` or `Synora-0.9.2-x64.dmg`). Open the `.dmg` and drag Synora to your Applications folder.*

#### Unpacked Directory (Local Testing)
To generate an unpacked executable folder without building a full installer:

```bash
cd desktop
bun run build:unpack
```

---

### 5. Running Tests

Run the full automated test suite (including unit tests for Google OAuth handling, service routing, and link dispatching):

```bash
bun test
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, code style, and testing details.

## License

This project is licensed under the terms described in the [LICENSE](LICENSE) file.
