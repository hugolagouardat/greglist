<script>
  import { createAd } from '../lib/api.js'
  import AdForm from '../lib/components/AdForm.svelte'
  import { navigate } from '../lib/router.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'

  export const title = 'Publier une annonce'

  let draftMessage = 'Prépare ton annonce puis publie-la sur Greglist.'
  let isSubmitting = false
  let errorMessage = ''

  async function handleSubmit(event) {
    if (!$isAuthenticated) {
      errorMessage = 'Connecte-toi avant de publier une annonce.'
      return
    }

    isSubmitting = true
    errorMessage = ''

    try {
      const payload = {
        ...event.detail,
        price: event.detail.price ? Number.parseFloat(event.detail.price) : null,
      }
      const ad = await createAd(payload, $auth.token)
      draftMessage = `Annonce publiée: ${ad.title}.`
      navigate(`/ads/${ad.id}`)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }
</script>

<p class="summary">Prépare une offre ou une demande avec sa catégorie, sa ville, sa disponibilité et son tarif éventuel.</p>

<div class="placeholder-card stack-gap">
  {#if $isAuthenticated}
    <AdForm on:submit={handleSubmit} />
  {:else}
    <p>Connecte-toi pour publier une annonce.</p>
  {/if}
  {#if isSubmitting}
    <p class="status-text">Publication en cours...</p>
  {/if}
  {#if errorMessage}
    <p class="error-text">{errorMessage}</p>
  {/if}
  <p>{draftMessage}</p>
</div>