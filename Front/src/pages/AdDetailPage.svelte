<script>
  import { deleteAd, getAd, getProtectedAd, publishAd, startConversation, unpublishAd } from '../lib/api.js'
  import { formatCategory, formatPrice, formatServiceTerms } from '../lib/adOptions.js'
  import { formatAdType, getAvatarUrl } from '../lib/media.js'
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
  let selectedImageIndex = 0

  $: isOwner = Boolean(ad && $auth.user?.id === ad.ownerId)
  $: currentImage = ad?.images?.[selectedImageIndex] || null

  async function loadAd() {
    if (!$auth.ready) return
    isLoading = true
    errorMessage = ''

    try {
      ad = $isAuthenticated ? await getProtectedAd(adId, $auth.token) : await getAd(adId)
      selectedImageIndex = 0
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  $: if ($auth.ready) loadAd()

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

  function showPreviousImage() {
    if (!ad?.images?.length) {
      return
    }

    selectedImageIndex = selectedImageIndex === 0 ? ad.images.length - 1 : selectedImageIndex - 1
  }

  function showNextImage() {
    if (!ad?.images?.length) {
      return
    }

    selectedImageIndex = selectedImageIndex === ad.images.length - 1 ? 0 : selectedImageIndex + 1
  }
</script>

<p class="summary">Consulte la galerie complète, repère le propriétaire d’un coup d’œil, puis ouvre un premier contact privé directement depuis la fiche.</p>

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
    <article class="placeholder-card stack-gap detail-primary-card">
      <div class="detail-stage">
        {#if currentImage}
          <img src={currentImage.url} alt={ad.title} class="detail-hero-image" />
        {:else}
          <div class="fallback-media detail-fallback-media">
            <strong>{ad.title.slice(0, 1)}</strong>
            <span>Annonce sans image</span>
          </div>
        {/if}

        <div class="owner-chip owner-chip-floating">
          {#if getAvatarUrl(ad.owner)}
            <img src={getAvatarUrl(ad.owner)} alt={ad.owner?.pseudo || 'Profil'} class="avatar-thumb" />
          {:else}
            <div class="avatar-fallback avatar-thumb">{ad.owner?.pseudo?.slice(0, 1) || '?'}</div>
          {/if}
          <div>
            <strong>{ad.owner?.pseudo || 'Membre Greglist'}</strong>
            <small>{ad.owner?.city || ad.city}</small>
          </div>
        </div>

        {#if ad.images?.length > 1}
          <div class="carousel-controls">
            <button class="ghost-button" type="button" on:click={showPreviousImage}>Précédente</button>
            <button class="ghost-button" type="button" on:click={showNextImage}>Suivante</button>
          </div>
        {/if}
      </div>

      {#if ad.images?.length > 1}
        <div class="thumbnail-rail">
          {#each ad.images as image, index}
            <button
              class:active-thumb={index === selectedImageIndex}
              class="thumbnail-button"
              type="button"
              on:click={() => (selectedImageIndex = index)}
              aria-label={`Afficher l'image ${index + 1}`}
            >
              <img src={image.url} alt={`${ad.title} ${index + 1}`} />
            </button>
          {/each}
        </div>
      {/if}

      <div class="stack-gap compact-gap">
        <div class="card-row-between">
          <p class="pill">{formatAdType(ad.type)}</p>
          <span class="muted-chip">{ad.status === 'PUBLISHED' ? 'Publiée' : 'Brouillon'}</span>
        </div>
        <h2>{ad.title}</h2>
        <p>{ad.description}</p>
      </div>

      <div class="card-meta detail-meta">
        <span>{formatCategory(ad.category)}</span>
        <span>{ad.city}</span>
        <span>{formatPrice(ad)}</span>
        <span>{ad.availability || 'Disponibilité à préciser'}</span>
        <span>{formatServiceTerms(ad.serviceTerms)}</span>
      </div>

      {#if isOwner}
        <div class="action-row">
          <button class="ghost-button" type="button" on:click={() => navigate(`/ads/${ad.id}/edit`)}>
            Modifier
          </button>
          {#if ad.status === 'PUBLISHED'}
            <button class="ghost-button" type="button" on:click={handleUnpublish}>Dépublier</button>
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
      <p>Cette annonce t’appartient. Tu peux y revenir pour ajuster la galerie, corriger le texte ou gérer sa publication.</p>
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