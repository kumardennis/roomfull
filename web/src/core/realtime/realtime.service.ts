import type { RealtimeChannel } from '@supabase/supabase-js'
import { chatRtLog } from './chat-realtime-debug'
import { verifyMessagesRealtimeAccess } from './realtime-access'
import { authService } from '../session/auth.service'
import { supabase } from '../supabase/client'

type Unsubscribe = () => void

export type RealtimeMessage = {
  id: string
  match_id: string
  sender_id: string
  body: string
  sent_at?: string
}

export type RealtimeVibe = {
  id: string
  from_participant: string
  to_participant: string
  status: string
}

export type RealtimeMatch = {
  id: string
  participant_a: string
  participant_b: string
}

async function ensureRealtimeReady() {
  await authService.bootstrapFromStore()
  await authService.syncRealtimeAuth()
}

function messageFromPostgresPayload(payload: { new: Record<string, unknown> }): RealtimeMessage | null {
  return messageFromRecord(payload.new)
}

function messageFromRecord(record: Record<string, unknown> | null | undefined): RealtimeMessage | null {
  if (!record?.id || !record?.match_id || !record?.sender_id || !record?.body) return null

  return {
    id: String(record.id),
    match_id: String(record.match_id),
    sender_id: String(record.sender_id),
    body: String(record.body),
    sent_at: record.sent_at ? String(record.sent_at) : undefined,
  }
}

function uniqueChannelName(base: string) {
  return `${base}:${crypto.randomUUID().slice(0, 8)}`
}

async function subscribePostgresChannel(
  name: string,
  bind: (channel: RealtimeChannel) => RealtimeChannel,
  debugLabel?: string,
): Promise<RealtimeChannel> {
  await ensureRealtimeReady()

  // Unique topic per subscription — React Strict Mode mounts twice in parallel and
  // supabase.channel() reuses an already-subscribed channel if the name matches.
  const channelName = uniqueChannelName(name)
  const channel = bind(supabase.channel(channelName))

  return subscribeChannel(channel, { debugLabel, logicalChannel: name, channelName })
}

async function subscribePrivateBroadcastChannel(
  topic: string,
  bind: (channel: RealtimeChannel) => RealtimeChannel,
  debugLabel?: string,
): Promise<RealtimeChannel> {
  await ensureRealtimeReady()

  // Topic must match DB trigger (e.g. match:{id}) for Realtime Authorization RLS.
  const channel = bind(
    supabase.channel(topic, {
      config: { private: true },
    }),
  )

  return subscribeChannel(channel, { debugLabel, logicalChannel: topic, channelName: topic })
}

function subscribeChannel(
  channel: RealtimeChannel,
  meta: { debugLabel?: string; logicalChannel: string; channelName: string },
): Promise<RealtimeChannel> {
  return new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (meta.debugLabel) {
        chatRtLog(`${meta.debugLabel}: subscribe`, {
          logicalChannel: meta.logicalChannel,
          channel: meta.channelName,
          status,
          error: err instanceof Error ? err.message : err,
        })
      }
      if (status === 'SUBSCRIBED') {
        resolve(channel)
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(err ?? new Error(`Realtime subscribe failed: ${status}`))
      }
    })
  })
}

export const realtimeService = {
  async subscribeSocialInbox(
    participantId: string,
    handlers: {
      onVibe?: (vibe: RealtimeVibe) => void
      onMessage?: (message: RealtimeMessage) => void
      onMatch?: (match: RealtimeMatch) => void
    },
  ): Promise<Unsubscribe> {
    const channel = await subscribePostgresChannel(`social-inbox:${participantId}`, (ch) =>
      ch
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'vibes',
            filter: `to_participant=eq.${participantId}`,
          },
          (payload) => {
            if (payload.new) handlers.onVibe?.(payload.new as RealtimeVibe)
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'vibes',
            filter: `to_participant=eq.${participantId}`,
          },
          (payload) => {
            if (!payload.new) return
            const next = payload.new as RealtimeVibe
            if (next.status !== 'pending') return
            const prev = payload.old as RealtimeVibe | undefined
            // Re-send after pass/expired updates the same row instead of inserting.
            if (prev?.status === 'pending') return
            handlers.onVibe?.(next)
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const message = payload.new
              ? messageFromPostgresPayload({ new: payload.new as Record<string, unknown> })
              : null
            if (message) handlers.onMessage?.(message)
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'matches' },
          (payload) => {
            if (payload.new) handlers.onMatch?.(payload.new as RealtimeMatch)
          },
        ),
    )

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async subscribeMatchChat(
    matchId: string,
    handler: (message: RealtimeMessage) => void,
  ): Promise<Unsubscribe> {
    const debugLabel = `matchChat:${matchId.slice(0, 8)}`
    const topic = `match:${matchId}`

    chatRtLog('subscribeMatchChat start (broadcast)', { matchId, topic })

    void verifyMessagesRealtimeAccess(matchId)

    const channel = await subscribePrivateBroadcastChannel(topic, (ch) =>
      ch.on('broadcast', { event: 'INSERT' }, ({ payload: change }) => {
        if (change.table !== 'messages') return
        const message = messageFromRecord(change.record as Record<string, unknown>)
        chatRtLog(`${debugLabel}: broadcast event`, { parsed: message, raw: change })
        if (message && message.match_id === matchId) {
          chatRtLog(`${debugLabel}: handler invoked`, { messageId: message.id })
          handler(message)
        }
      }),
      debugLabel,
    )

    chatRtLog(`${debugLabel}: subscribed`, {
      channel: channel.topic,
      activeChannels: supabase.getChannels().map((ch) => ch.topic),
    })

    return () => {
      chatRtLog(`${debugLabel}: unsubscribe`)
      void supabase.removeChannel(channel)
    }
  },

  async onMessageInsert(
    matchId: string,
    handler: (message: RealtimeMessage) => void,
  ): Promise<Unsubscribe> {
    const topic = `match:${matchId}`

    const channel = await subscribePrivateBroadcastChannel(topic, (ch) =>
      ch.on('broadcast', { event: 'INSERT' }, ({ payload: change }) => {
        if (change.table !== 'messages') return
        const message = messageFromRecord(change.record as Record<string, unknown>)
        if (message && message.match_id === matchId) handler(message)
      }),
    )

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async onVibeChange(participantId: string, handler: () => void): Promise<Unsubscribe> {
    const channel = await subscribePostgresChannel(`vibes:${participantId}`, (ch) =>
      ch
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'vibes',
            filter: `to_participant=eq.${participantId}`,
          },
          handler,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'vibes',
            filter: `to_participant=eq.${participantId}`,
          },
          handler,
        ),
    )

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async onMatchChange(handler: () => void): Promise<Unsubscribe> {
    const channel = await subscribePostgresChannel('matches:mine', (ch) =>
      ch
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'matches' },
          handler,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches' },
          handler,
        ),
    )

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async onRoundAnswersChange(
    roundId: string,
    handler: () => void,
  ): Promise<Unsubscribe> {
    const channel = await subscribePostgresChannel(`round-answers:${roundId}`, (ch) =>
      ch.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
          filter: `round_id=eq.${roundId}`,
        },
        handler,
      ),
    )

    return () => {
      void supabase.removeChannel(channel)
    }
  },

  async onSessionPlayStateChange(
    sessionId: string,
    handler: () => void,
  ): Promise<Unsubscribe> {
    const channel = await subscribePostgresChannel(`session-play:${sessionId}`, (ch) =>
      ch
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'sessions',
            filter: `id=eq.${sessionId}`,
          },
          handler,
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'rounds',
            filter: `session_id=eq.${sessionId}`,
          },
          handler,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rounds',
            filter: `session_id=eq.${sessionId}`,
          },
          handler,
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'answers',
          },
          handler,
        ),
    )

    return () => {
      void supabase.removeChannel(channel)
    }
  },
}
