import { derived, writable } from 'svelte/store'

const initialState = {
  token: '',
  user: null,
  ready: false,
}

function createAuthStore() {
  const { subscribe, set, update } = writable(initialState)

  function hydrate() {
    const rawSession = localStorage.getItem('greglist.auth')

    if (!rawSession) {
      set({ ...initialState, ready: true })
      return
    }

    try {
      const parsedSession = JSON.parse(rawSession)
      set({
        token: parsedSession.token || '',
        user: parsedSession.user || null,
        ready: true,
      })
    } catch {
      localStorage.removeItem('greglist.auth')
      set({ ...initialState, ready: true })
    }
  }

  function setSession(session) {
    const nextState = {
      token: session.token,
      user: session.user,
      ready: true,
    }

    localStorage.setItem('greglist.auth', JSON.stringify(nextState))
    set(nextState)
  }

  function patchUser(user) {
    update((state) => {
      const nextState = { ...state, user }
      localStorage.setItem('greglist.auth', JSON.stringify(nextState))
      return nextState
    })
  }

  function clearSession() {
    localStorage.removeItem('greglist.auth')
    set({ ...initialState, ready: true })
  }

  return {
    subscribe,
    hydrate,
    setSession,
    patchUser,
    clearSession,
  }
}

export const auth = createAuthStore()

export const isAuthenticated = derived(auth, ($auth) => Boolean($auth.token && $auth.user))