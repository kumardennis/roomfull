#!/usr/bin/env node
/**
 * Core-loop smoke against a live Supabase project (service role).
 *
 * Usage (from repo root):
 *   node --env-file=.env --import=tsx web/scripts/core-loop-smoke.mts
 * Or:
 *   cd web && node --env-file=../.env scripts/core-loop-smoke.mts
 *
 * Requires SUPABASE_URL + SUPABASE_SECRET_KEY.
 * Creates isolated rows tagged CORE_LOOP_SMOKE_* and deletes them in finally.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
for (const envPath of [resolve(root, '.env'), resolve(root, 'scheduler/.env')]) {
  if (existsSync(envPath)) loadEnv({ path: envPath, quiet: true })
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  ok — ${message}`)
}

const url = required('SUPABASE_URL')
const key = required('SUPABASE_SECRET_KEY')
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const tag = `CORE_LOOP_SMOKE_${Date.now()}`
const slug = `smoke-${Date.now()}`
const qr = `smoke-${Date.now()}`

const cleanup: {
  venueId?: string
  questionIds: string[]
  sessionId?: string
  roundIds: string[]
} = { questionIds: [], roundIds: [] }

async function main() {
  console.log('core-loop smoke starting…')

  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .insert({ name: `${tag} Venue`, slug })
    .select('id')
    .single()
  if (venueErr) throw venueErr
  cleanup.venueId = venue.id

  const questionRows = [
    {
      format: 'this_or_that' as const,
      prompt: `${tag} opener`,
      options: ['Coffee', 'Tea'],
      self_report_prompt: null,
      correct_option: null,
    },
    {
      format: 'hot_take' as const,
      prompt: `${tag} opinion`,
      options: ['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree'],
      self_report_prompt: null,
      correct_option: null,
    },
    {
      format: 'prediction' as const,
      prompt: `${tag} prediction`,
      options: ['0-25%', '26-50%', '51-75%', '76-100%'],
      self_report_prompt: 'Have you seen it?',
      correct_option: null,
    },
    {
      format: 'two_truths_one_lie' as const,
      prompt: `${tag} ttol`,
      options: ['I own a cat', 'I am a robot', 'I drink water'],
      self_report_prompt: null,
      correct_option: 'I am a robot',
    },
  ]

  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .insert(questionRows)
    .select('id, format, prompt')
  if (qErr) throw qErr
  cleanup.questionIds = questions.map((q) => q.id)

  const byPrompt = Object.fromEntries(questions.map((q) => [q.prompt, q]))
  const opener = byPrompt[`${tag} opener`]
  const opinion = byPrompt[`${tag} opinion`]
  const prediction = byPrompt[`${tag} prediction`]
  const ttol = byPrompt[`${tag} ttol`]

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({
      venue_id: venue.id,
      qr_code: qr,
      status: 'active',
      phase: 'opener',
      opener_question_id: opener.id,
      host_pin: 'smokepin',
      scheduled_starts_at: new Date(Date.now() - 60_000).toISOString(),
      started_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 7_200_000).toISOString(),
      phase_deadline: new Date(Date.now() + 600_000).toISOString(),
      opener_window_sec: 600,
      interstitial_sec: 60,
      current_plan_index: -1,
    })
    .select('id')
    .single()
  if (sErr) throw sErr
  cleanup.sessionId = session.id

  const { error: planErr } = await supabase.from('session_round_plan').insert([
    { session_id: session.id, position: 0, question_id: opinion.id, duration_sec: 90 },
    { session_id: session.id, position: 1, question_id: prediction.id, duration_sec: 90 },
    { session_id: session.id, position: 2, question_id: ttol.id, duration_sec: 90 },
  ])
  if (planErr) throw planErr

  const { data: join, error: joinErr } = await supabase.rpc('join_session', {
    p_qr_code: qr,
    p_handle: 'SmokeHero',
  })
  if (joinErr) throw joinErr
  assert(join?.participant_token, 'join_session returns participant_token')

  const token = join.participant_token as string

  let state = (await supabase.rpc('get_session_state', { p_participant_token: token })).data
  assert(state?.participant?.needs_opener === true, 'needs_opener before opener')

  const { error: openerErr } = await supabase.rpc('submit_opener', {
    p_participant_token: token,
    p_answer: 'Coffee',
  })
  if (openerErr) throw openerErr

  state = (await supabase.rpc('get_session_state', { p_participant_token: token })).data
  assert(state?.participant?.needs_opener === false, 'needs_opener after opener')

  const { data: opinionRound, error: orErr } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      question_id: opinion.id,
      round_number: 1,
      opens_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 120_000).toISOString(),
      status: 'open',
    })
    .select('id')
    .single()
  if (orErr) throw orErr
  cleanup.roundIds.push(opinionRound.id)

  await supabase
    .from('sessions')
    .update({ phase: 'round_live', current_plan_index: 0 })
    .eq('id', session.id)

  state = (await supabase.rpc('get_session_state', { p_participant_token: token })).data
  assert(Array.isArray(state?.open_round?.question?.options), 'open_round.question.options is array')
  assert(state?.session?.phase === 'round_live', 'session.phase is round_live')

  const { error: ansErr } = await supabase.rpc('submit_answer', {
    p_participant_token: token,
    p_round_id: opinionRound.id,
    p_chosen_option: 'Agree',
    p_self_report_value: null,
  })
  if (ansErr) throw ansErr

  const { data: opinionAnswer } = await supabase
    .from('answers')
    .select('chosen_option, is_correct')
    .eq('round_id', opinionRound.id)
    .eq('participant_id', join.participant_id)
    .single()
  assert(opinionAnswer?.chosen_option === 'Agree', 'opinion answer stored')
  assert(opinionAnswer?.is_correct == null, 'opinion unscored')

  const { data: predRound, error: prErr } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      question_id: prediction.id,
      round_number: 2,
      opens_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 120_000).toISOString(),
      status: 'open',
    })
    .select('id')
    .single()
  if (prErr) throw prErr
  cleanup.roundIds.push(predRound.id)

  await supabase.from('rounds').update({ status: 'closed' }).eq('id', opinionRound.id)

  const { error: predMissing } = await supabase.rpc('submit_answer', {
    p_participant_token: token,
    p_round_id: predRound.id,
    p_chosen_option: '76-100%',
    p_self_report_value: null,
  })
  assert(predMissing, 'prediction without self_report fails')
  assert(
    String(predMissing.message || predMissing).toLowerCase().includes('self_report'),
    'prediction error mentions self_report',
  )

  const { error: predOk } = await supabase.rpc('submit_answer', {
    p_participant_token: token,
    p_round_id: predRound.id,
    p_chosen_option: '76-100%',
    p_self_report_value: 'Yes',
  })
  if (predOk) throw predOk
  assert(true, 'prediction with self_report succeeds')

  const { data: ttolRound, error: trErr } = await supabase
    .from('rounds')
    .insert({
      session_id: session.id,
      question_id: ttol.id,
      round_number: 3,
      opens_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 120_000).toISOString(),
      status: 'open',
    })
    .select('id')
    .single()
  if (trErr) throw trErr
  cleanup.roundIds.push(ttolRound.id)

  await supabase.from('rounds').update({ status: 'closed' }).eq('id', predRound.id)

  const { error: ttolErr } = await supabase.rpc('submit_answer', {
    p_participant_token: token,
    p_round_id: ttolRound.id,
    p_chosen_option: 'I am a robot',
    p_self_report_value: null,
  })
  if (ttolErr) throw ttolErr

  const { data: ttolAnswer } = await supabase
    .from('answers')
    .select('chosen_option')
    .eq('round_id', ttolRound.id)
    .eq('participant_id', join.participant_id)
    .single()
  assert(ttolAnswer?.chosen_option === 'I am a robot', 'ttol answer stored')

  console.log('core-loop smoke passed')
}

async function teardown() {
  if (cleanup.sessionId) {
    if (cleanup.roundIds.length) {
      await supabase.from('answers').delete().in('round_id', cleanup.roundIds)
      await supabase.from('rounds').delete().in('id', cleanup.roundIds)
    }
    await supabase.from('session_round_plan').delete().eq('session_id', cleanup.sessionId)
    await supabase.from('session_deadlines').delete().eq('session_id', cleanup.sessionId)
    await supabase.from('domain_events').delete().eq('session_id', cleanup.sessionId)
    await supabase.from('participants').delete().eq('session_id', cleanup.sessionId)
    await supabase.from('sessions').delete().eq('id', cleanup.sessionId)
  }
  if (cleanup.questionIds.length) {
    await supabase.from('questions').delete().in('id', cleanup.questionIds)
  }
  if (cleanup.venueId) {
    await supabase.from('venues').delete().eq('id', cleanup.venueId)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => teardown().catch((err) => console.error('teardown error', err)))
