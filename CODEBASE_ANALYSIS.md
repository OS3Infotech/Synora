# Synora (Nora) — Comprehensive Codebase & Technical Analysis

> **Target Audience:** Developers, Technical Leads, and DevOps Engineers  
> **Repository:** `OS3Infotech/Synora` (core: `nora`)  
> **Product Nature:** Cross-platform intelligence workspace, multi-platform social/news feed reader, and distraction-free deck browser.

---

## 1. Executive Summary & Architecture Overview

Synora is a unified intelligence and feed browsing workspace available across **Desktop (Windows, macOS, Linux)**, **Mobile (Android, iOS)**, and **Web**.

The platform is engineered as a hybrid monorepo:
1. **Core / Mobile & Web (`/` root):** Built with **React Native 0.88** and **Expo SDK 58** (Bare Workflow, New Architecture enabled) using file-based routing (`expo-router`), reactive observable state (`@legendapp/state`), and custom native Android (Kotlin) / iOS (Swift) modules (`nora-view`, `nora-billing`).
2. **Desktop Application (`/desktop`):** Built with **Electron 43** and **electron-vite** (Vite 7), utilizing a clean triple-layer architecture (Main process, Preload scripts, Renderer UI). The desktop renderer integrates React Native Web alongside Radix UI and `@dnd-kit` for deck/tab split-screen workspaces.
3. **Injected Content Engine (`/content`):** Standalone TypeScript scripts compiled via Bun / esbuild into IIFE browser bundles (`assets/scripts/*.bjs`), providing ad blocking, tracker protection, cosmetic filtering, anonymous paywall/modal bypass, gesture detection, and WebRTC leak protection directly inside embedded browser views.

---

## 2. Technology Stack Breakdown

### 2.1 Runtimes & Package Management
- **Bun (`v1.1+`):** Primary fast JavaScript/TypeScript runtime, package manager (workspaces: `desktop`), bundler (`bun build`), test runner (`bun test`), and automation runner.
- **Node.js (`>=20`, CI uses 24):** Used for platform build tools, Electron packaging, and Gradle coordination.

### 2.2 Core Frameworks & UI Layer
- **Mobile Core:** React Native `0.88.0` with React `19.3.0`.
- **Mobile Framework:** Expo SDK `~58.0.14` (Bare workflow, `newArchEnabled: true`). Uses `expo-build-properties` to configure custom Android ABIs and ProGuard/R8 optimizations.
- **Routing:** `expo-router` `~58.0.23` (file-based routing, typed routes enabled).
- **Desktop Shell:** Electron `43.2.0` with `electron-vite` `^4.0.0` (Vite 7) and `electron-builder` `26.1.0`.
- **Styling:** NativeWind `^4.1.23` + Tailwind CSS `^3` (`tailwind.config.js`). Android dynamic colors via `@material/material-color-utilities`.
- **Desktop UI Components:** `@radix-ui/themes` (`^3.2.1`), `@dnd-kit/core` (`^6.3.0`), and `react-native-web` (`^0.21.4`).

### 2.3 State Management, Storage & Database
- **Observable State:** `@legendapp/state` (`3.0.0-beta.47`) for fine-grained reactivity.
- **Key-Value Storage:** `react-native-mmkv` (`^4.3.2`) for instant, synchronous persistence.
- **Relational Database:** SQLite (`watch.db` with WAL mode) via `expo-sqlite` on mobile and `node:sqlite` on desktop.
- **Cloud Backend & Sync:** Supabase (`@supabase/supabase-js` `^2.90.1`) for multi-device sync, conflict resolution, and tombstone tracking.

### 2.4 Browser Engines & Native Modules
- **`modules/nora-view`:** Custom native WebView engine on Android (Kotlin) and iOS (Swift) for isolated cookie jars, HTTP/SOCKS5 proxy routing, download interception, and WebRTC leak prevention.
- **`content/` Engine:** Bundled into `assets/scripts/main.bjs`, `webrtc.bjs`, and `youtube.bjs`.

---

## 3. Supported Platforms, SNS & AI Hubs

- **AI & Intelligence Hubs:** Staying Ahead AI, ChatGPT, Claude, Google Gemini, Perplexity AI, Grok, Microsoft Copilot, Poe, Hugging Face, Character.AI.
- **Social Networks (SNS):** LinkedIn, X (Twitter), Bluesky, Instagram, Facebook, Threads, Reddit, TikTok, Mastodon, Pinterest, Twitch, Tumblr, Quora, VK.
- **Messaging & Workspace:** WhatsApp Web, Telegram Web, Discord, Slack, Facebook Messenger.
- **Publishing & News:** Medium, Substack, WordPress, RSS 2.0 & Atom 1.0 feeds, and global news outlets (BBC, Reuters, AP, NPR, NYT, Guardian, CNN, Al Jazeera).

---

## 4. Release Architecture & Lifecycle

- **Versioning (`scripts/bump.ts`):** Centralized in `package.json` (`version`, `versionCode`, `buildNumber`).
- **Desktop Releases (`.github/workflows/release-desktop.yml`):**
  - Matrix across Windows (portable `.exe`, `.appx`), Linux (`.AppImage`, `.snap`), and macOS (`.dmg`, `.zip` with code signing and notarization).
  - Publishes to GitHub Releases with changelogs parsed from `desktop/changelogs/v{VER}.txt`.
- **Android Releases (`.github/workflows/build.yml` & Fastlane):**
  - **Full Release:** Expo prebuild -> `./gradlew assembleFullRelease` -> `r0adkll/sign-android-release` -> APK published to GitHub Releases; Google Play AAB via Fastlane `:upload_aab`.
  - **FOSS Release:** Strips proprietary code (`rm -rf modules/nora-view/android/src/full`) -> `./gradlew assembleFossRelease` -> DEX bytecode verification guaranteeing 0% Google ML Kit.
- **iOS Releases (`scripts/upload-app-store.ts` & Fastlane):**
  - Fastlane `:upload_ipa` pushes builds to App Store Connect via API key (`APP_STORE_KEY_ID`).
- **Flatpak Releases (`.github/workflows/flatpak-assets.yml`):**
  - QEMU multi-arch tarballs published to `nonbili/Nora-Desktop` for Flathub.

