const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000'

function createAdRequestBody(payload) {
  const { images = [], ...data } = payload

  if (!Array.isArray(images) || images.length === 0) {
    return data
  }

  const formData = new FormData()
  formData.append('payload', JSON.stringify(data))

  images.forEach((file) => {
    formData.append('images', file)
  })

  return formData
}

async function request(path, { method = 'GET', body, token } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(!isFormData && body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  })

  if (response.status === 204) {
    return null
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Erreur API')
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

export function getCurrentUser(token) {
  return request('/me', { token })
}

export function updateCurrentUser(payload, token) {
  return request('/me', {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function uploadAvatar(file, token) {
  const formData = new FormData()
  formData.append('avatar', file)

  return request('/me/avatar', {
    method: 'PUT',
    body: formData,
    token,
  })
}

export function deleteAvatar(token) {
  return request('/me/avatar', {
    method: 'DELETE',
    token,
  })
}

export function deleteCurrentUser(token) {
  return request('/me', {
    method: 'DELETE',
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

export function getProtectedAd(adId, token) {
  return request(`/ads/${adId}`, { token })
}

export function createAd(payload, token) {
  return request('/ads', {
    method: 'POST',
    body: createAdRequestBody(payload),
    token,
  })
}

export function updateAd(adId, payload, token) {
  return request(`/ads/${adId}`, {
    method: 'PUT',
    body: createAdRequestBody(payload),
    token,
  })
}

export function deleteAd(adId, token) {
  return request(`/ads/${adId}`, {
    method: 'DELETE',
    token,
  })
}

export function getMyAds(token) {
  return request('/me/ads', { token })
}

export function publishAd(adId, token) {
  return request(`/ads/${adId}/publish`, {
    method: 'POST',
    token,
  })
}

export function unpublishAd(adId, token) {
  return request(`/ads/${adId}/unpublish`, {
    method: 'POST',
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

export function sendConversationMessage(conversationId, content, token) {
  return request(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { content },
    token,
  })
}