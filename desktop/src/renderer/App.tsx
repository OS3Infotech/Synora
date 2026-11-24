import contentJs from 'nora/assets/scripts/main.bjs?raw'
import { MainPage } from 'nora/components/page/MainPage'
import { Toaster } from 'react-hot-toast'
import { useObserveEffect } from '@legendapp/state/react'
import { useEffect } from 'react'
import { initUiChannel } from './ipc/ui'
import { mainClient } from './ipc/main'
import { handleShortcuts } from './lib/shortcuts'
import { ImagePreview } from './components/ImagePreview'
import { HoverLinkBar } from './components/HoverLinkBar'
import { settings$ } from 'nora/states/settings'
import { bookmarks$ } from 'nora/states/bookmarks'
import { tabs$ } from 'nora/states/tabs'
import { isFeedTabUrl } from 'nora/lib/feed-tab'
import { openTabInDesktopGroup } from 'nora/lib/desktop-view-actions'
import { homeUrls } from 'nora/lib/page'
import { useBlocklistSync } from 'nora/lib/hooks/useBlocklistSync'

const getHost = (url: string | undefined) => {
  if (!url) return ''
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

const getInternalHosts = () => {
  const hosts = new Set<string>()

  Object.values(homeUrls).forEach((url) => {
    const host = getHost(url)
    if (host) hosts.add(host)
  })

  bookmarks$.bookmarks.get().forEach((bookmark) => {
    const host = getHost(bookmark?.url)
    if (host) hosts.add(host)
  })

  return Array.from(hosts)
}

let lastLinkHandlingSettingsKey = ''

function App(): React.JSX.Element {
  useEffect(() => {
    initUiChannel()
    // Captured: react-native-web's TextInput stops every keydown, so a focused field would swallow them.
    window.addEventListener('keydown', handleShortcuts, true)

    // When Synora opens, ensure it shows a new tab first, not feed
    const allTabs = tabs$.tabs.get()
    const current = tabs$.currentTab()
    if (!current || isFeedTabUrl(current.url)) {
      const existingNewTab = allTabs.find((t) => !t.url)
      if (existingNewTab) {
        tabs$.setActiveTabById(existingNewTab.id, 'user')
      } else {
        openTabInDesktopGroup(null, '')
      }
    }

    return () => window.removeEventListener('keydown', handleShortcuts, true)
  }, [])

  useBlocklistSync()

  useObserveEffect(() => {
    const openExternalLinkInSystemBrowser = settings$.openExternalLinkInSystemBrowser.get()
    const internalHosts = getInternalHosts()
    const key = JSON.stringify({ openExternalLinkInSystemBrowser, internalHosts })
    if (key === lastLinkHandlingSettingsKey) {
      return
    }
    lastLinkHandlingSettingsKey = key
    void mainClient.setLinkHandlingSettings({
      openExternalLinkInSystemBrowser,
      internalHosts,
    })
  })

  useObserveEffect(() => {
    void mainClient.setWebRtcProtection(settings$.protectWebRtcIp.get())
  })

  return (
    <>
      <MainPage contentJs={contentJs} />
      <HoverLinkBar />
      <ImagePreview />
      <Toaster position="bottom-right" />
    </>
  )
}
export default App
