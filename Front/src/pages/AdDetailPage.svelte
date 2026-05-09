<script>
  import { deleteAd, getAd, getProtectedAd, publishAd, startConversation, unpublishAd } from '../lib/api.js'
  import { formatCategory, formatPrice, formatServiceTerms } from '../lib/adOptions.js'
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
  let loadKey = ''

  $: isOwner = Boolean(ad && $auth.user?.id === ad.ownerId)

  async function loadAd() {
    isLoading = true
    errorMessage = ''

    try {
      ad = $isAuthenticated ? await getProtectedAd(adId, $auth.token) : await getAd(adId)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

      $: {
        const nextLoadKey = `${adId}:${$auth.ready ? $auth.token : 'pending'}`

        if ($auth.ready && nextLoadKey !== loadKey) {
          loadKey = nextLoadKey
          loadAd()
        }
      }

  async function handlePublish() {
    try {
      ad = await publishAd(ad.id, $auth.token)
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleUnpublish() {
    try {
      ad = await unpublishAd(ad.id, $auth.token)
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleDelete() {
    try {
      await deleteAd(ad.id, $auth.token)
      navigate('/profile')
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleFirstMessage() {
    if (!$isAuthenticated) {
      navigate('/login')
      return
    }

    if (isOwner) {
      errorMessage = 'Tu ne peux pas contacter ta propre annonce.'
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

<p class="summary">Consulte le detail d’une annonce publiee, puis ouvre un premier contact prive avec l’auteur. Le proprietaire peut aussi gerer la publication depuis cet ecran.</p>

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
      <span>{formatCategory(ad.category)}</span>
      <span>{ad.city}</span>
      <span>{formatPrice(ad)}</span>
      <span>{ad.availability || 'Disponibilité à préciser'}</span>
      <span>{formatServiceTerms(ad.serviceTerms)}</span>
      <span>{ad.status === 'PUBLISHED' ? 'Publiee' : 'Brouillon'}</span>
    </div>
    <p>Annonce de {ad.owner?.pseudo || 'Utilisateur inconnu'}.</p>

    {#if isOwner}
      <div class="action-row">
        <button class="ghost-button" type="button" on:click={() => navigate(`/ads/${ad.id}/edit`)}>
          Modifier
        </button>
        {#if ad.status === 'PUBLISHED'}
          <button class="ghost-button" type="button" on:click={handleUnpublish}>Depublier</button>
        {:else}
          <button class="primary-button" type="button" on:click={handlePublish}>Publier</button>
        {/if}
        <button class="ghost-button danger-button" type="button" on:click={handleDelete}>Supprimer</button>
      </div>
    {/if}
  </article>

  <aside class="placeholder-card stack-gap">
    {#if isOwner}
      <h2>Gestion</h2>
      <p>Cette annonce t’appartient. Utilise les actions ci-contre pour la modifier, la publier, la depublier ou la supprimer.</p>
    {:else}
      <h2>Contact</h2>
      <p>{formatServiceTerms(ad.serviceTerms)}</p>
      <textarea bind:value={firstMessage} rows="5" placeholder="Votre premier message"></textarea>
      <button class="primary-button" type="button" on:click={handleFirstMessage} disabled={isSubmitting}>
        {isSubmitting ? 'Envoi...' : 'Envoyer un message'}
      </button>
    {/if}
    {#if errorMessage}
      <p class="error-text">{errorMessage}</p>
    {/if}
  </aside>
  {/if}
</section>