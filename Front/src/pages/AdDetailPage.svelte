<script>
  import { getAd, startConversation } from '../lib/api.js'
  import { navigate } from '../lib/router.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { onMount } from 'svelte'

  export let adId
  export const title = 'Détail d’annonce'
  let ad = null
  let firstMessage = ''
  let isLoading = true
  let isSubmitting = false
  let errorMessage = ''

  async function loadAd() {
    isLoading = true
    errorMessage = ''

    try {
      ad = await getAd(adId)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  async function handleFirstMessage() {
    if (!$isAuthenticated) {
      errorMessage = 'Connecte-toi pour envoyer un message.'
      return
    }

    if (!firstMessage.trim()) {
      errorMessage = 'Le premier message est obligatoire.'
      return
    }

    isSubmitting = true
    errorMessage = ''

    try {
      const response = await startConversation(adId, firstMessage.trim(), $auth.token)
      navigate(`/conversations/${response.conversation.id}`)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }

  onMount(loadAd)

  $: if (adId) {
    loadAd()
  }
</script>

<p class="summary">Le détail de l’annonce présente les informations clés avant l’ouverture d’une conversation.</p>

<section class="detail-layout">
  {#if isLoading}
    <article class="placeholder-card">
      <p>Chargement de l’annonce...</p>
    </article>
  {:else if errorMessage && !ad}
    <article class="placeholder-card">
      <p class="error-text">{errorMessage}</p>
    </article>
  {:else if ad}
  <article class="placeholder-card stack-gap">
    <h2>{ad.title}</h2>
    <p>{ad.description}</p>
    <div class="card-meta">
      <span>{ad.category}</span>
      <span>{ad.city}</span>
      <span>{ad.price ? `${ad.price} €` : 'Prix à définir'}</span>
      <span>{ad.availability || 'Disponibilité à préciser'}</span>
    </div>
  </article>

  <aside class="placeholder-card stack-gap">
    <h2>Contact</h2>
    <p>{ad.terms || 'Modalités à préciser avec le propriétaire.'}</p>
    <textarea bind:value={firstMessage} rows="5" placeholder="Votre premier message"></textarea>
    <button class="primary-button" type="button" on:click={handleFirstMessage} disabled={isSubmitting}>
      {isSubmitting ? 'Envoi...' : 'Envoyer un message'}
    </button>
    {#if errorMessage}
      <p class="error-text">{errorMessage}</p>
    {/if}
  </aside>
  {/if}
</section>