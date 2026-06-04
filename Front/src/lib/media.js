export function getAvatarUrl(user) {
  return user?.avatar?.url || ''
}

export function getCoverImage(ad) {
  return ad?.coverImage || ad?.images?.[0] || null
}

export function formatAdType(type) {
  return type === 'OFFER' ? 'Offre' : 'Demande'
}