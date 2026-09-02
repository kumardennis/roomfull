import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

const isNewApiKey = (apiKey: string) =>
  apiKey.startsWith('sb_publishable_') || apiKey.startsWith('sb_secret_')

/**
 * Publishable/secret keys are not JWTs and must not appear in Authorization.
 * supabase-js still falls back to Bearer for PostgREST when there is no session;
 * strip that header so only `apikey` identifies the project.
 */
function createFetchWithoutKeyBearer(apiKey: string): typeof fetch {
  if (!isNewApiKey(apiKey)) return fetch

  const bearerKey = `Bearer ${apiKey}`

  return async (input, init) => {
    const headers = new Headers(init?.headers)
    if (headers.get('Authorization') === bearerKey) {
      headers.delete('Authorization')
    }
    return fetch(input, { ...init, headers })
  }
}

export const supabase = createClient<Database>(url, key, {
  global: {
    fetch: createFetchWithoutKeyBearer(key),
  },
})
