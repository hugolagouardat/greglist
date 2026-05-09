<script>
  import { onMount } from 'svelte'
  import { getAds } from '../lib/api.js'
  import { adCategories, formatCategory, formatPrice, formatServiceTerms } from '../lib/adOptions.js'
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
  let requestId = 0

  async function loadAds() {
    const currentRequestId = ++requestId
    isLoading = true
    errorMessage = ''

    try {
      const nextAds = await getAds({ search, type, category, city, sort })

      if (currentRequestId === requestId) {
        ads = nextAds
      }
    } catch (error) {
      if (currentRequestId === requestId) {
        errorMessage = error.message
      }
    } finally {
      if (currentRequestId === requestId) {
        isLoading = false
      }
    }
  }

  onMount(loadAds)

  $: void search, void type, void category, void city, void sort, loadAds()
</script>

<p class="summary">Parcours les annonces publiees, recherche par mots-cles, filtre par type ou categorie, et trie les resultats par date ou tarif.</p>

<section class="stack-gap">
  <div class="placeholder-card">
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

  <div class="card-grid">
    {#if isLoading}
      <article class="placeholder-card">
        <p>Chargement des annonces...</p>
      </article>
    {:else if errorMessage}
      <article class="placeholder-card">
        <p class="error-text">{errorMessage}</p>
      </article>
    {:else}
      {#each ads as ad}
      <article class="listing-card">
        <p class="pill">{ad.type === 'OFFER' ? 'Offre' : 'Demande'}</p>
        <h2>{ad.title}</h2>
        <p>{ad.description}</p>
        <div class="card-meta">
          <span>{formatCategory(ad.category)}</span>
          <span>{ad.city}</span>
          <span>{formatPrice(ad)}</span>
          <span>{formatServiceTerms(ad.serviceTerms)}</span>
        </div>
        <button class="primary-button" type="button" on:click={() => navigate(`/ads/${ad.id}`)}>
          Voir l’annonce
        </button>
      </article>
      {/each}
    {/if}
  </div>
</section>