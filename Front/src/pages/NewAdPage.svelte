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
        priceValue: event.detail.priceMode === 'FREE' ? null : Number.parseFloat(event.detail.priceValue),
        status: 'DRAFT',
      }
      const ad = await createAd(payload, $auth.token)
      draftMessage = `Annonce en brouillon: ${ad.title}.`
      navigate('/profile')
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }
</script>

<p class="summary">Crée une annonce conforme avec catégorie fixe, tarif explicite et modalités de service. Elle sera enregistrée en brouillon puis publiable depuis ton profil.</p>

<div class="placeholder-card stack-gap">
  {#if $isAuthenticated}
    <AdForm submitLabel="Enregistrer en brouillon" on:submit={handleSubmit} />
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