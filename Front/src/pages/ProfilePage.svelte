<script>
  import { deleteAd, getMyAds, logoutUser, publishAd, unpublishAd } from '../lib/api.js'
  import { formatCategory, formatPrice, formatPriceMode, formatServiceTerms } from '../lib/adOptions.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { navigate } from '../lib/router.js'
  import { onMount } from 'svelte'

  export const title = 'Profil'

  let ads = []
  let isLoading = false
  let errorMessage = ''

  async function loadAds() {
    if (!$isAuthenticated) {
      ads = []
      return
    }

    isLoading = true
    errorMessage = ''

    try {
      ads = await getMyAds($auth.token)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  async function handlePublish(adId) {
    try {
      const updatedAd = await publishAd(adId, $auth.token)
      ads = ads.map((ad) => (ad.id === adId ? updatedAd : ad))
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleUnpublish(adId) {
    try {
      const updatedAd = await unpublishAd(adId, $auth.token)
      ads = ads.map((ad) => (ad.id === adId ? updatedAd : ad))
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleDelete(adId) {
    try {
      await deleteAd(adId, $auth.token)
      ads = ads.filter((ad) => ad.id !== adId)
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleLogout() {
    errorMessage = ''

    try {
      if ($auth.token) {
        await logoutUser($auth.token)
      }
    } catch (error) {
      errorMessage = error.message
    } finally {
      auth.clearSession()
      navigate('/')
    }
  }

  onMount(loadAds)
</script>

<p class="summary">Retrouve tes informations de compte et gere tout le cycle de vie de tes annonces: modification, publication, depublication et suppression.</p>

{#if $isAuthenticated}
  <div class="stack-gap">
    <div class="placeholder-grid">
      <article>
        <h2>Pseudo</h2>
        <p>{$auth.user?.pseudo}</p>
      </article>
      <article>
        <h2>Ville</h2>
        <p>{$auth.user?.city || 'Non renseignee'}</p>
      </article>
      <article class="full-width">
        <h2>Bio</h2>
        <p>{$auth.user?.bio || 'Aucune bio pour le moment.'}</p>
      </article>
      <article class="full-width stack-gap">
        <div class="action-row">
          <button class="primary-button" type="button" on:click={() => navigate('/ads/new')}>Nouvelle annonce</button>
          <button class="ghost-button inline-button" type="button" on:click={handleLogout}>Se deconnecter</button>
        </div>
      </article>
    </div>

    <section class="stack-gap">
      <h2>Mes annonces</h2>

      {#if isLoading}
        <div class="placeholder-card">
          <p>Chargement des annonces...</p>
        </div>
      {:else if !ads.length}
        <div class="placeholder-card">
          <p>Aucune annonce pour le moment.</p>
        </div>
      {:else}
        <div class="card-grid">
          {#each ads as ad}
            <article class="listing-card">
              <div class="card-meta">
                <span>{ad.type === 'OFFER' ? 'Offre' : 'Demande'}</span>
                <span>{ad.status === 'PUBLISHED' ? 'Publiee' : 'Brouillon'}</span>
              </div>
              <h2>{ad.title}</h2>
              <p>{ad.description}</p>
              <div class="card-meta">
                <span>{formatCategory(ad.category)}</span>
                <span>{ad.city}</span>
                <span>{formatPrice(ad)}</span>
                <span>{formatPriceMode(ad.priceMode)}</span>
                <span>{formatServiceTerms(ad.serviceTerms)}</span>
              </div>
              <div class="action-row">
                <button class="ghost-button" type="button" on:click={() => navigate(`/ads/${ad.id}`)}>Voir</button>
                <button class="ghost-button" type="button" on:click={() => navigate(`/ads/${ad.id}/edit`)}>Modifier</button>
                {#if ad.status === 'PUBLISHED'}
                  <button class="ghost-button" type="button" on:click={() => handleUnpublish(ad.id)}>Depublier</button>
                {:else}
                  <button class="primary-button" type="button" on:click={() => handlePublish(ad.id)}>Publier</button>
                {/if}
                <button class="ghost-button danger-button" type="button" on:click={() => handleDelete(ad.id)}>Supprimer</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    {#if errorMessage}
      <div class="placeholder-card">
        <p class="error-text">{errorMessage}</p>
      </div>
    {/if}
  </div>
{:else}
  <div class="placeholder-card">
    <p>Connecte-toi pour voir ton profil.</p>
  </div>
{/if}