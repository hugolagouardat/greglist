const API_BASE_URL = 'http://127.0.0.1:3000'

async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return null
  }

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error || 'Erreur API')
  }

  return payload
}

export function registerUser(payload) {
  return request('/register', {
    method: 'POST',
    body: payload,
  })
}

export function loginUser(payload) {
  return request('/login', {
    method: 'POST',
    body: payload,
  })
}

export function logoutUser(token) {
  return request('/logout', {
    method: 'POST',
    token,
  })
}

export function getAds(filters = {}) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value)
    }
  })

  const query = params.toString()

  return request(`/ads${query ? `?${query}` : ''}`)
}

export function getAd(adId) {
  return request(`/ads/${adId}`)
}

export function createAd(payload, token) {
  return request('/ads', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function startConversation(adId, content, token) {
  return request(`/ads/${adId}/conversations`, {
    method: 'POST',
    body: { content },
    token,
  })
}

export function getConversations(token) {
  return request('/conversations', { token })
}

export function getConversationMessages(conversationId, token) {
  return request(`/conversations/${conversationId}/messages`, { token })
}