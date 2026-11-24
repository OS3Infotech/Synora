import 'expo-modules-core-polyfill'
import '@/lib/i18n'
import './global.css'

import { useEffect, useState, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Theme } from '@radix-ui/themes'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { Appearance } from 'react-native'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('App crashed:', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#f87171', background: '#0c0d12', height: '100vh', boxSizing: 'border-box', fontFamily: 'monospace' }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Application Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 8, fontSize: 13 }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Patch Appearance for react-native-web.
const originalAppearance = Appearance as any
let customColorScheme: 'dark' | 'light' | null = null
const listeners = new Set<(appearance: { colorScheme: 'dark' | 'light' }) => void>()

if (typeof originalAppearance.setColorScheme !== 'function') {
  const getColorScheme = () => {
    if (customColorScheme) return customColorScheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  originalAppearance.setColorScheme = (scheme: 'dark' | 'light' | null) => {
    customColorScheme = scheme
    const appearance = { colorScheme: getColorScheme() }
    listeners.forEach((listener) => listener(appearance))
  }

  const originalAddChangeListener = originalAppearance.addChangeListener
  originalAppearance.getColorScheme = getColorScheme
  originalAppearance.addChangeListener = (listener: any) => {
    listeners.add(listener)
    const subscription = originalAddChangeListener ? originalAddChangeListener(listener) : { remove: () => {} }

    return {
      remove: () => {
        listeners.delete(listener)
        subscription.remove?.()
      },
    }
  }
}

export function Root(): React.JSX.Element {
  const theme = useValue(settings$.theme)
  const [systemAppearance, setSystemAppearance] = useState<'dark' | 'light'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      const appearance = mediaQuery.matches ? 'dark' : 'light'
      setSystemAppearance(appearance)
      if (!theme) {
        listeners.forEach((listener) => listener({ colorScheme: appearance }))
      }
    }
    onChange()
    mediaQuery.addEventListener?.('change', onChange)
    mediaQuery.addListener?.(onChange)
    return () => {
      mediaQuery.removeEventListener?.('change', onChange)
      mediaQuery.removeListener?.(onChange)
    }
  }, [theme])

  useEffect(() => {
    const appearance = theme ?? systemAppearance
    if (appearance === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    Appearance.setColorScheme(theme ?? systemAppearance ?? 'light')
  }, [theme, systemAppearance])

  return (
    <SafeAreaProvider>
      <Theme className="h-screen" appearance={theme ?? systemAppearance} accentColor="gray" grayColor="slate">
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </Theme>
    </SafeAreaProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
