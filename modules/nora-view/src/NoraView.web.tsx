import * as React from 'react'
import { NoraViewProps } from './NoraView.types'

export default function NoraView(props: NoraViewProps) {
  // The Electron <webview> is a DOM element that only understands lowercase string
  // attributes. Drop the native-only props (they are no-ops here and React warns about
  // boolean/camelCase attributes like `inspectable={false}` and `textZoom`).
  const { inspectable, textZoom, scrollEvents, scriptOnStart, scriptOnDocumentStart, profile, onLoad, onMessage, style, ...rest } = props
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    width: '100%',
    height: '100%',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    outline: 'none',
    ...(typeof style === 'object' && style ? style : {}),
  }
  // @ts-expect-error webview is an Electron custom element
  return <webview style={baseStyle} {...rest} />
}
