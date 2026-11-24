import React from 'react'
import { Pressable, View, useColorScheme } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { NouText } from '@/components/NouText'
import { NouMenu, type Item } from '@/components/menu/NouMenu'
import { Tooltip } from '@/components/tooltip/Tooltip'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { auth$ } from '@/states/auth'
import { isTabInProfile } from '@/lib/profile'
import { isFeedTabUrl } from '@/lib/feed-tab'
import { clsx } from '@/lib/utils'

export const ProfileSwitcher: React.FC<{ collapsed?: boolean; mode?: 'profile' | 'space' }> = ({
  collapsed = false,
  mode = 'profile',
}) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const iconColor = isDark ? '#94a3b8' : '#64748b'

  const selectedProfileId = useValue(settings$.selectedProfileId) || 'default'
  const profiles = useValue(settings$.profiles)
  const allTabs = useValue(tabs$.tabs)
  const user = useValue(auth$.user)
  const userEmail = useValue(auth$.userEmail)

  const currentProfile =
    profiles.find((p) => p.id === selectedProfileId) ||
    profiles.find((p) => p.id === 'default') ||
    profiles[0]

  const isAll = selectedProfileId === 'all'
  const profileColor = isAll ? '#6366f1' : currentProfile?.color || '#6366f1'
  const profileName = isAll ? t('profiles.all') || 'All Profiles' : currentProfile?.name || 'Default'
  const displayInitial = (profileName.trim().charAt(0) || 'D').toUpperCase()
  const currentTabCount = isAll
    ? allTabs.filter((t) => !isFeedTabUrl(t.url)).length
    : allTabs.filter((t) => !isFeedTabUrl(t.url) && isTabInProfile(t, selectedProfileId)).length

  const switchProfile = (profileId: string) => {
    settings$.selectedProfileId.set(profileId)
    ui$.lastSelectedProfileId.set(profileId === 'all' ? 'default' : profileId)

    const matchingTabs = allTabs.filter((t) => !isFeedTabUrl(t.url) && isTabInProfile(t, profileId))
    const currentActiveTab = allTabs[tabs$.activeTabIndex.get()]

    if (matchingTabs.length > 0) {
      if (!currentActiveTab || !matchingTabs.some((t) => t.id === currentActiveTab.id)) {
        tabs$.setActiveTabById(matchingTabs[0].id, 'user')
      }
    } else if (profileId !== 'all') {
      tabs$.openTab('', { profile: profileId, profileMode: 'manual', source: 'manual' })
    }
  }

  const menuItems: Item[] = [
    {
      kind: 'label',
      label: t('profiles.switchProfile') || 'Profiles & Spaces',
      handler: () => {},
    },
    ...profiles.map((profile) => {
      const isSelected = selectedProfileId === profile.id
      const count = allTabs.filter((t) => !isFeedTabUrl(t.url) && isTabInProfile(t, profile.id)).length
      return {
        label: profile.name,
        description: `${count} ${count === 1 ? 'tab' : 'tabs'}`,
        icon: (
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: profile.color,
            }}
          />
        ),
        meta: isSelected ? <MaterialIcons name="check" size={16} color={profile.color} /> : undefined,
        handler: () => switchProfile(profile.id),
      }
    }),
    {
      kind: 'separator',
      label: '',
      handler: () => {},
    },
    {
      label: t('profiles.all') || 'All Profiles',
      description: `${allTabs.length} ${allTabs.length === 1 ? 'tab' : 'tabs'}`,
      icon: <MaterialIcons name="grid-view" size={16} color={iconColor} />,
      meta: isAll ? <MaterialIcons name="check" size={16} color="#6366f1" /> : undefined,
      handler: () => switchProfile('all'),
    },
    {
      kind: 'separator',
      label: '',
      handler: () => {},
    },
    {
      label: t('profiles.addProfile') || 'New Profile…',
      icon: <MaterialIcons name="add" size={18} color={iconColor} />,
      handler: () => {
        ui$.assign({
          profileModalOpen: true,
          editingProfileId: null,
        })
      },
    },
    {
      label: t('profiles.manageProfiles') || 'Manage Profiles…',
      icon: <MaterialIcons name="settings" size={18} color={iconColor} />,
      handler: () => {
        ui$.settingsModalOpen.set(true)
      },
    },
  ]

  // Render top Space Card
  if (mode === 'space') {
    if (collapsed) {
      return (
        <Tooltip title={`Synora Core - ${profileName} Space`}>
          <Pressable className="h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#7c3aed',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <NouText className="text-xs font-bold text-white">S</NouText>
            </View>
          </Pressable>
        </Tooltip>
      )
    }

    const spaceTrigger = (
      <Pressable className="w-full flex-row items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-white/[0.06] transition-colors">
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#7c3aed',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NouText className="text-sm font-bold text-white">S</NouText>
        </View>
        <View className="min-w-0 flex-1">
          <NouText className="truncate text-xs font-semibold text-zinc-100" numberOfLines={1}>
            Synora Core
          </NouText>
          <NouText className="truncate text-[11px] text-zinc-400" numberOfLines={1}>
            {profileName === 'Default' ? 'Personal Space' : `${profileName} Space`}
          </NouText>
        </View>
        <MaterialIcons name="unfold-more" size={16} color="#94a3b8" />
      </Pressable>
    )

    return (
      <View className="w-full px-1">
        <NouMenu trigger={spaceTrigger} items={menuItems} />
      </View>
    )
  }

  // Render bottom Profile Switcher
  const trigger = collapsed ? (
    <Tooltip title={profileName}>
      <Pressable className="h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: profileColor || '#7c3aed',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NouText className="text-xs font-bold text-white">{displayInitial}</NouText>
        </View>
      </Pressable>
    </Tooltip>
  ) : (
    <Pressable className="flex-row items-center gap-2 rounded-lg py-1 px-1.5 hover:bg-white/[0.06] transition-colors">
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: profileColor || '#7c3aed',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <NouText className="text-xs font-bold text-white">{displayInitial}</NouText>
      </View>
      <NouText className="truncate text-xs font-medium text-zinc-200 max-w-[130px]" numberOfLines={1}>
        {profileName}
      </NouText>
      <MaterialIcons name="keyboard-arrow-down" size={16} color="#94a3b8" />
    </Pressable>
  )

  return (
    <View className={clsx(collapsed ? 'items-center' : 'flex-row items-center')}>
      <NouMenu trigger={trigger} items={menuItems} />
    </View>
  )
}
