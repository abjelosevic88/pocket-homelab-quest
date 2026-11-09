import type { AppSlug, AppStateName } from './types'

export const APP_INFO: Record<AppSlug, { name: string; icon: string }> = {
  calendar: { name: 'Pocket Calendar', icon: 'calendar' },
  notes: { name: 'Pocket Notes', icon: 'note' },
  chat: { name: 'Pocket Chat', icon: 'message' },
  tasks: { name: 'Pocket Tasks', icon: 'check-square' },
}

export const STATE_WORDS: Record<AppStateName, string> = {
  on: 'connected', partly: 'partly connected', off: 'switched off', link_off: 'switched off in Pocket Core', missing: 'not on this box',
  old: 'needs an update', no_core: 'no Pocket Core', not_set_up: 'not set up', error: 'not reachable',
}
