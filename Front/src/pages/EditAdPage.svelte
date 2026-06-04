<script>
  import { getProtectedAd, updateAd } from '../lib/api.js'
  import AdForm from '../lib/components/AdForm.svelte'
  import { navigate } from '../lib/router.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { onMount } from 'svelte'

  export let adId
  export const title = 'Modifier une annonce'

  let ad = null
  let isLoading = false
  let isSubmitting = false
  let errorMessage = ''
  let statusMessage = ''

  async function loadAd() {
    if (!$isAuthenticated) return

    isLoading = true
    errorMessage = ''

    try {
      ad = await getProtectedAd(adId, $auth.token)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  async function handleSubmit(event) {
    isSubmitting = true
    errorMessage = ''
    statusMessage = ''

    try {
      const payload = {
        ...event.detail,
        priceValue: event.detail.priceMode === 'FREE' ? null : Number.parseFloat(event.detail.priceValue),
      }
      const updatedAd = await updateAd(adId, payload, $auth.token)
      statusMessage = `Annonce mise a jour: ${updatedAd.title}.`
      navigate(`/ads/${adId}`)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }

  onMount(loadAd)
</script>

<p class="summary">Modifie le contenu, la galerie et l’ordre d’affichage de ton annonce sans perdre le contrôle de sa publication.</p>

<div class="placeholder-card stack-gap">
  {#if isLoading}
    <p>Chargement de l’annonce...</p>
  {:else if errorMessage && !ad}
    <p class="error-text">{errorMessage}</p>
  {:else if ad}
    <AdForm initialValue={ad} submitLabel="Enregistrer les modifications" on:submit={handleSubmit} />
  {/if}

  {#if isSubmitting}
    <p class="status-text">Mise a jour en cours...</p>
  {/if}
  {#if errorMessage && ad}
    <p class="error-text">{errorMessage}</p>
  {/if}
  {#if statusMessage}
    <p class="status-text">{statusMessage}</p>
  {/if}
</div>