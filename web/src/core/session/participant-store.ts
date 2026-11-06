const TOKEN_KEY = 'roomfull_participant_token'
const SESSION_KEY = 'roomfull_session_id'
const PARTICIPANT_ID_KEY = 'roomfull_participant_id'
const HANDLE_KEY = 'roomfull_handle'
const JOINED_AT_KEY_PREFIX = 'roomfull_joined_at:'

export const participantStore = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },

  getId(): string | null {
    return localStorage.getItem(PARTICIPANT_ID_KEY)
  },

  getSessionId(): string | null {
    return localStorage.getItem(SESSION_KEY)
  },

  getHandle(): string | null {
    return localStorage.getItem(HANDLE_KEY)
  },

  isCheckedIn(): boolean {
    return Boolean(this.getToken())
  },

  save(token: string, sessionId: string, participantId: string, handle?: string) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(SESSION_KEY, sessionId)
    localStorage.setItem(PARTICIPANT_ID_KEY, participantId)
    if (handle) {
      localStorage.setItem(HANDLE_KEY, handle)
    }
  },

  setHandle(handle: string) {
    localStorage.setItem(HANDLE_KEY, handle)
  },

  /** Keeps the first join time so a rejoin into the same participant doesn't reset it. */
  markJoined(participantId: string) {
    const key = JOINED_AT_KEY_PREFIX + participantId
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, String(Date.now()))
    }
  },

  getJoinedAt(): number | null {
    const participantId = this.getId()
    if (!participantId) return null
    const raw = localStorage.getItem(JOINED_AT_KEY_PREFIX + participantId)
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) ? value : null
  },

  clear() {
    const participantId = this.getId()
    if (participantId) {
      localStorage.removeItem(JOINED_AT_KEY_PREFIX + participantId)
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(PARTICIPANT_ID_KEY)
    localStorage.removeItem(HANDLE_KEY)
  },

  requireToken(): string {
    const token = this.getToken()
    if (!token) throw new Error('Not checked in')
    return token
  },
}
