export const adCategories = [
  { value: 'HOME_HELP', label: 'Aide a domicile' },
  { value: 'GARDENING', label: 'Jardinage' },
  { value: 'TUTORING', label: 'Cours' },
  { value: 'IT_SUPPORT', label: 'Informatique' },
  { value: 'BEAUTY_WELLNESS', label: 'Beaute et bien-etre' },
  { value: 'EVENTS', label: 'Evenementiel' },
  { value: 'MOVING_DELIVERY', label: 'Demanagement et livraison' },
  { value: 'OTHER', label: 'Autre' },
]

export const priceModes = [
  { value: 'FREE', label: 'Gratuit' },
  { value: 'HOURLY', label: 'Tarif horaire' },
  { value: 'FIXED', label: 'Tarif fixe' },
]

export const serviceTerms = [
  { value: 'REMOTE', label: 'A distance' },
  { value: 'AT_PROVIDER', label: 'Chez le prestataire' },
  { value: 'AT_CUSTOMER', label: 'Chez le client' },
]

const categoryLabels = Object.fromEntries(adCategories.map((option) => [option.value, option.label]))
const priceModeLabels = Object.fromEntries(priceModes.map((option) => [option.value, option.label]))
const serviceTermLabels = Object.fromEntries(serviceTerms.map((option) => [option.value, option.label]))

export function formatCategory(category) {
  return categoryLabels[category] || category
}

export function formatPrice(ad) {
  if (ad.priceMode === 'FREE') {
    return 'Gratuit'
  }

  if (ad.priceMode === 'HOURLY') {
    return `${ad.priceValue} EUR / h`
  }

  if (ad.priceMode === 'FIXED') {
    return `${ad.priceValue} EUR`
  }

  return 'Tarif non precise'
}

export function formatPriceMode(priceMode) {
  return priceModeLabels[priceMode] || priceMode
}

export function formatServiceTerm(value) {
  return serviceTermLabels[value] || value
}

export function formatServiceTerms(values = []) {
  if (!values.length) {
    return 'Modalites non precisees'
  }

  return values.map((value) => serviceTermLabels[value] || value).join(', ')
}