<script>
  import { getConversations } from '../lib/api.js'
  import { navigate } from '../lib/router.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { onMount } from 'svelte'

  export const title = 'Inbox'

  let conversations = []
  let isLoading = false
  let errorMessage = ''

  async function loadConversations() {
    if (!$isAuthenticated) {
      conversations = []
      return
    }

    isLoading = true
    errorMessage = ''

    try {
      conversations = await getConversations($auth.token)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  onMount(loadConversations)
</script>

<p class="summary">La boîte de réception centralise les conversations ouvertes depuis les annonces.</p>

<div class="stack-gap">
  {#if !$isAuthenticated}
    <article class="placeholder-card">
      <p>Connecte-toi pour consulter ta boîte de réception.</p>
    </article>
  {:else if isLoading}
    <article class="placeholder-card">
      <p>Chargement des conversations...</p>
    </article>
  {:else if errorMessage}
    <article class="placeholder-card">
      <p class="error-text">{errorMessage}</p>
    </article>
  {:else}
    {#each conversations as conversation}
      <article class="listing-card">
        <div class="card-meta">
          <span>Annonce #{conversation.adId}</span>
          <span>{new Date(conversation.updatedAt).toLocaleString('fr-FR')}</span>
        </div>
        <h2>{conversation.ad?.title || `Conversation ${conversation.id}`}</h2>
        <p>{conversation.messages[0]?.content || 'Aucun message pour le moment.'}</p>
        <button class="primary-button" type="button" on:click={() => navigate(`/conversations/${conversation.id}`)}>
          Ouvrir la conversation
        </button>
      </article>
    {/each}
  {/if}
</div>