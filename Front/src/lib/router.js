import { readable } from 'svelte/store'

function getCurrentRoute() {
  return {
    path: window.location.pathname || '/',
  }
}

export const route = readable(getCurrentRoute(), (set) => {
  const update = () => set(getCurrentRoute())

  window.addEventListener('popstate', update)

  return () => {
    window.removeEventListener('popstate', update)
  }
})

export function navigate(path) {
  if (window.location.pathname === path) {
    return
  }

  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}