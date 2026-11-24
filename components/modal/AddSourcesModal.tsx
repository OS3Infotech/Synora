import { useEffect, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import * as Clipboard from 'expo-clipboard'
import { t } from 'i18next'
import { FormModal } from './FormModal'
import { NouText } from '../NouText'
import { WatchSites } from '../feed/WatchSites'
import { ui$ } from '@/states/ui'
import { getTimeline, watch$ } from '@/states/watch'
import { watchKey, watchSiteLabels, watchSourceLabel } from '@/lib/watch'
import { refreshWatched } from '@/lib/watch-feed'
import { sourceFromUrl } from '@/lib/watch-transfer'
import { showToast } from '@/lib/toast'
import { useTwColor } from '@/lib/theme'
import { SOCIAL_FEED_TIMELINE_ID } from '@/lib/feed-tab'

/** The links in what was typed or pasted, each with the source it is of, if any. */
const readLinks = (text: string) =>
  text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((link) => ({ link, target: sourceFromUrl(link) }))

/** Adds sources by their links into the timeline it was opened from, if any. */
export const AddSourcesModal = () => {
  const tw = useTwColor()
  const target = useValue(ui$.addSourcesModal)
  const profiles = useValue(watch$.profiles)
  const timelines = useValue(watch$.timelines)
  const [text, setText] = useState('')

  useEffect(() => {
    setText('')
    if (!target) return
    let cancelled = false
    // A profile link just copied is likely the one to add, unless it was added already, as it stays copied after.
    Clipboard.getStringAsync()
      .then((copied) => {
        const links = readLinks(copied)
        const timeline = getTimeline(target.timelineId)
        const added = new Set(
          watch$.profiles
            .peek()
            .filter((profile) => !timeline || profile.timelineId === timeline.id)
            .map((profile) => profile.key),
        )
        const fresh = links.some(({ target: source }) => source && !added.has(watchKey(source)))
        if (!cancelled && fresh && links.every((link) => link.target)) setText((current) => current || copied.trim())
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [target])

  const onClose = () => ui$.addSourcesModal.set(null)

  if (!target) {
    return null
  }

  const watched = new Set(profiles.map((profile) => profile.key))
  const isSocial = target.timelineId === SOCIAL_FEED_TIMELINE_ID
  const socialSiteSet = new Set(['instagram', 'x', 'facebook', 'tiktok', 'threads', 'bluesky'])
  // Already added: in the timeline it was opened from, or watched at all for the whole feed.
  const timeline = timelines.find((current) => current.id === target.timelineId)
  const added = timeline
    ? new Set(profiles.filter((profile) => profile.timelineId === timeline.id).map((profile) => profile.key))
    : watched
  // The timeline each source already watched is in, which adding it here moves it out of.
  const timelineOf = new Map(
    profiles.flatMap((profile) => {
      const current = timelines.find((t) => t.id === profile.timelineId)
      return current ? [[profile.key, current.name] as const] : []
    }),
  )
  const links = readLinks(text)
  const toAdd = [
    ...new Map(
      links.flatMap(({ target }) =>
        target &&
        !added.has(watchKey(target)) &&
        (isSocial ? socialSiteSet.has(target.site) : !socialSiteSet.has(target.site))
          ? [[watchKey(target), target]]
          : [],
      ),
    ).entries(),
  ]

  const save = () => {
    const newKeys = toAdd.filter(([key]) => !watched.has(key)).map(([key]) => key)
    for (const [key, source] of toAdd) {
      if (!watched.has(key)) watch$.watch(source)
    }
    if (timeline) {
      for (const [key] of toAdd) watch$.setProfileTimeline(key, timeline.id)
    }
    showToast(t('feed.addSourcesDone', { count: toAdd.length }))
    if (newKeys.length) void refreshWatched('manual', newKeys)
    onClose()
  }

  return (
    <FormModal
      title={isSocial ? 'Add Social Sources' : timeline ? t('feed.addSourcesTo', { name: timeline.name }) : 'Add AI Community Source'}
      onClose={onClose}
      onSubmit={save}
      submitLabel={toAdd.length ? t('feed.addSourcesSubmit', { count: toAdd.length }) : t('feed.add')}
      submitDisabled={!toAdd.length}
    >
      <TextInput
        // A few lines tall, as it takes a link on each.
        className="mb-3 max-h-40 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        style={{ minHeight: 96, textAlignVertical: 'top' }}
        value={text}
        onChangeText={setText}
        placeholder={isSocial ? 'Paste Instagram, X (Twitter), Facebook, or TikTok profile links...' : 'Paste AI community RSS, Reddit, Substack, ArXiv, Hugging Face, or blog links...'}
        placeholderTextColor={tw('#9ca3af')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        multiline
        autoFocus
      />
      {links.length ? (
        <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
          {links.map(({ link, target: source }, index) => {
            const isSocialSource = source ? socialSiteSet.has(source.site) : false
            const isMismatched = !isSocial ? isSocialSource : (!isSocialSource && source != null)
            const already = source ? added.has(watchKey(source)) : false
            return (
              <View key={`${index}:${link}`} className="flex-row items-center gap-3 py-1.5">
                <MaterialIcons
                  name={
                    isMismatched
                      ? 'warning-amber'
                      : source
                        ? already
                          ? 'check-circle-outline'
                          : 'add-circle-outline'
                        : 'error-outline'
                  }
                  size={20}
                  color={isMismatched ? tw('#f59e0b') : source ? (already ? tw('#a1a1aa') : tw('#6366f1')) : tw('#ef4444')}
                />
                {source ? (
                  <>
                    <NouText className="flex-1" numberOfLines={1}>
                      {watchSourceLabel(source)}
                    </NouText>
                    <NouText className={clsx('text-xs', isMismatched ? 'text-amber-500 font-medium' : 'text-zinc-500')}>
                      {isMismatched
                        ? !isSocial
                          ? 'Social source: please use Social Feed'
                          : 'Community source: please use Feed'
                        : already
                          ? t('feed.addSourcesAlready')
                          : timeline && timelineOf.has(watchKey(source))
                            ? t('feed.addSourcesMove', { name: timelineOf.get(watchKey(source)) })
                            : watchSiteLabels[source.site]}
                    </NouText>
                  </>
                ) : (
                  <View className="flex-1">
                    <NouText className="text-sm" numberOfLines={1}>
                      {link}
                    </NouText>
                    <NouText className="text-xs text-zinc-500">{t('feed.addSourcesUnrecognized')}</NouText>
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      ) : (
        // Shrinks, and scrolls, to leave the buttons in view above the keyboard.
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          <NouText className="text-sm leading-5 text-zinc-500 dark:text-zinc-400">
            {isSocial
              ? 'Paste profile links from Instagram, X (Twitter), Facebook, TikTok, Threads, or Bluesky. Each on its own line.'
              : 'Paste AI community links (ArXiv, Reddit, Hugging Face, Substack, blogs, or RSS feeds). Each on its own line.'}
          </NouText>
          <WatchSites
            compact
            className="mt-4"
            sites={
              isSocial
                ? ['instagram', 'x', 'facebook', 'tiktok', 'threads', 'bluesky']
                : ['reddit', 'substack', 'medium', 'rss', 'wordpress']
            }
          />
        </ScrollView>
      )}
    </FormModal>
  )
}
