<script>
  import { onMount } from 'svelte'
  import { getAds } from '../lib/api.js'
  import { adCategories, formatCategory, formatPrice, formatServiceTerm } from '../lib/adOptions.js'
  import { formatAdType, getAvatarUrl, getCoverImage } from '../lib/media.js'
  import { navigate } from '../lib/router.js'

  export const title = 'Annonces'

  let search = ''
  let type = ''
  let category = ''
  let city = ''
  let sort = 'newest'
  let ads = []
  let isLoading = false
  let errorMessage = ''

  async function loadAds() {
    isLoading = true
    errorMessage = ''

    try {
      ads = await getAds({ search, type, category, city, sort })
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  onMount(loadAds)

  $: void search, void type, void category, void city, void sort, loadAds()
</script>

<div class="hero-banner">
  <p class="summary">Parcours les annonces publiées près de chez toi : propose un service ou trouve le bon coup de main, puis ouvre une conversation privée en un clic.</p>
</div>

<section class="stack-gap">
  <div class="placeholder-card filters-panel">
    <div class="form-grid">
      <label>
        <span>Recherche</span>
        <input bind:value={search} placeholder="mot-clé" />
      </label>
      <label>
        <span>Type</span>
        <select bind:value={type}>
          <option value="">Tous</option>
          <option value="OFFER">Offre</option>
          <option value="REQUEST">Demande</option>
        </select>
      </label>
      <label>
        <span>Catégorie</span>
        <select bind:value={category}>
          <option value="">Toutes</option>
          {#each adCategories as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Ville</span>
        <input bind:value={city} placeholder="Paris" />
      </label>
      <label class="full-width">
        <span>Tri</span>
        <select bind:value={sort}>
          <option value="newest">Plus récent</option>
          <option value="price_asc">Tarif croissant</option>
          <option value="price_desc">Tarif décroissant</option>
        </select>
      </label>
    </div>
  </div>

  <div class="card-grid listing-grid">
    {#if isLoading}
      <article class="placeholder-card">
        <p>Chargement des annonces...</p>
      </article>
    {:else if errorMessage}
      <article class="placeholder-card">
        <p class="error-text">{errorMessage}</p>
      </article>
    {:else if !ads.length}
      <article class="placeholder-card empty-state-card">
        <p>Aucune annonce ne correspond à ces filtres pour le moment.</p>
      </article>
    {:else}
      {#each ads as ad}
        <article class="listing-card interactive-card">
          <div class="listing-media">
            {#if getCoverImage(ad)}
              <img src={getCoverImage(ad).url} alt={ad.title} />
            {:else}
              <div class="fallback-media">
                <strong>{ad.title.slice(0, 1)}</strong>
                <span>Sans image</span>
              </div>
            {/if}
          </div>

          <div class="listing-card-body">
            <div class="card-row-between">
              <p class="pill">{formatAdType(ad.type)}</p>
              <span class="muted-chip">{formatPrice(ad)}</span>
            </div>

            <div class="stack-gap compact-gap">
              <h2>{ad.title}</h2>
              <p class="card-excerpt">{ad.description}</p>
            </div>

            <div class="card-meta">
              <span class="meta-chip meta-chip-category">{formatCategory(ad.category)}</span>
              <span class="meta-chip meta-chip-city">{ad.city}</span>
              {#each ad.serviceTerms as term}
                <span class="meta-chip">{formatServiceTerm(term)}</span>
              {/each}
            </div>

            <div class="owner-inline">
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

            <button class="primary-button" type="button" on:click={() => navigate(`/ads/${ad.id}`)}>
              Voir l’annonce
            </button>
          </div>
        </article>
      {/each}
    {/if}
  </div>
</section>