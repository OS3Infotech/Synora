import React from 'react'
import { View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { tabs$ } from '@/states/tabs'
import { NouText } from '@/components/NouText'
import { Tooltip } from '@/components/tooltip/Tooltip'
import { openFeedTab, openSocialFeedTab } from '@/lib/page'
import { openTabInDesktopGroup } from '@/lib/desktop-view-actions'
import { isFeedTabUrl, isSocialFeedTabUrl } from '@/lib/feed-tab'
import { clsx } from '@/lib/utils'
import { t } from 'i18next'

interface SidebarSectionsProps {
  collapsed?: boolean
  workspaceContent?: React.ReactNode
}

export const SidebarSections: React.FC<SidebarSectionsProps> = ({
  collapsed = false,
  workspaceContent,
}) => {
  const currentTab = useValue(tabs$.currentTab)
  const isFeedActive = Boolean(currentTab && isFeedTabUrl(currentTab.url) && !isSocialFeedTabUrl(currentTab.url))
  const isSocialFeedActive = Boolean(currentTab && isSocialFeedTabUrl(currentTab.url))

  const renderSectionHeader = (title: string, icon?: string) => {
    if (collapsed) return <View className="h-1.5" />
    return (
      <View className="flex-row items-center justify-between px-2 pt-3 pb-1">
        <View className="flex-row items-center gap-1.5">
          {icon ? <MaterialIcons name={icon as any} size={13} color="#71717a" /> : null}
          <NouText className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {title}
          </NouText>
        </View>
      </View>
    )
  }

  return (
    <View className="w-full">
      {/* WORKSPACE SECTION */}
      {renderSectionHeader('Workspace', 'dashboard')}

      {/* Main Feed Tab */}
      {collapsed ? (
        <Tooltip title="Feed" key="feed">
          <button
            type="button"
            onClick={() => openFeedTab()}
            className={clsx(
              'h-9 w-9 flex items-center justify-center rounded-xl transition-colors relative my-0.5 bg-transparent border-0 p-0 cursor-pointer outline-none',
              isFeedActive ? 'bg-white/[0.16] text-white shadow-sm' : 'hover:bg-white/[0.06] text-zinc-400',
            )}
          >
            <MaterialIcons name="grid-view" size={18} color={isFeedActive ? '#ffffff' : '#94a3b8'} />
            {isFeedActive ? (
              <View className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
            ) : null}
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={() => openFeedTab()}
          className={clsx(
            'flex flex-row items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors my-0.5 w-full bg-transparent border-0 cursor-pointer outline-none',
            isFeedActive ? 'bg-white/[0.12] text-white font-medium' : 'hover:bg-white/[0.05] text-zinc-300',
          )}
        >
          <View className="flex-row items-center gap-2.5 min-w-0 flex-1">
            <MaterialIcons name="grid-view" size={16} color={isFeedActive ? '#ffffff' : '#94a3b8'} />
            <NouText
              className={clsx(
                'truncate text-[13px]',
                isFeedActive ? 'text-white font-medium' : 'text-zinc-200',
              )}
              numberOfLines={1}
            >
              Feed
            </NouText>
          </View>
          {isFeedActive ? (
            <View className="rounded-full bg-indigo-600 px-2 py-0.5">
              <NouText className="text-[11px] font-medium text-white">Active</NouText>
            </View>
          ) : null}
        </button>
      )}

      {/* Social Feed Tab */}
      {collapsed ? (
        <Tooltip title="Social Feed" key="social-feed">
          <button
            type="button"
            onClick={() => openSocialFeedTab()}
            className={clsx(
              'h-9 w-9 flex items-center justify-center rounded-xl transition-colors relative my-0.5 bg-transparent border-0 p-0 cursor-pointer outline-none',
              isSocialFeedActive ? 'bg-white/[0.16] text-white shadow-sm' : 'hover:bg-white/[0.06] text-zinc-400',
            )}
          >
            <MaterialIcons name="people" size={18} color={isSocialFeedActive ? '#ffffff' : '#94a3b8'} />
            {isSocialFeedActive ? (
              <View className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-pink-500" />
            ) : null}
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={() => openSocialFeedTab()}
          className={clsx(
            'flex flex-row items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors my-0.5 w-full bg-transparent border-0 cursor-pointer outline-none',
            isSocialFeedActive ? 'bg-white/[0.12] text-white font-medium' : 'hover:bg-white/[0.05] text-zinc-300',
          )}
        >
          <View className="flex-row items-center gap-2.5 min-w-0 flex-1">
            <MaterialIcons name="people" size={16} color={isSocialFeedActive ? '#ffffff' : '#94a3b8'} />
            <NouText
              className={clsx(
                'truncate text-[13px]',
                isSocialFeedActive ? 'text-white font-medium' : 'text-zinc-200',
              )}
              numberOfLines={1}
            >
              Social Feed
            </NouText>
          </View>
          {isSocialFeedActive ? (
            <View className="rounded-full bg-pink-600 px-2 py-0.5">
              <NouText className="text-[11px] font-medium text-white">Active</NouText>
            </View>
          ) : null}
        </button>
      )}

      {/* Workspace open tabs & groups */}
      {workspaceContent}

      {collapsed ? (
        <Tooltip title={t('tabs.new') || 'New Tab'}>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openTabInDesktopGroup(null, '')
            }}
            className="h-9 w-9 flex items-center justify-center rounded-xl transition-colors relative my-0.5 bg-transparent border-0 p-0 cursor-pointer outline-none hover:bg-white/[0.08] text-zinc-400"
          >
            <MaterialIcons name="add" size={18} color="#94a3b8" />
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            openTabInDesktopGroup(null, '')
          }}
          className="flex flex-row items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/[0.05] my-0.5 w-full bg-transparent border-0 cursor-pointer outline-none text-left"
        >
          <MaterialIcons name="add-box" size={16} color="#94a3b8" />
          <NouText className="text-[13px] text-zinc-300">{t('tabs.new') || 'New Tab'}</NouText>
        </button>
      )}
    </View>
  )
}
