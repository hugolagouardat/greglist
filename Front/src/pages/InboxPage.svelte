<script>
  import { getConversations } from '../lib/api.js'
  import { navigate } from '../lib/router.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { onDestroy, onMount } from 'svelte'

  export const title = 'Inbox'

  let conversations = []
  let isLoading = false
  let errorMessage = ''
  let isRequestInFlight = false
  let pollTimer = null

  async function loadConversations({ background = false } = {}) {
    if (!$isAuthenticated) {
      conversations = []
      return
    }

    if (isRequestInFlight) {
      return
    }

    if (!background) {
      isLoading = true
      errorMessage = ''
    }

    isRequestInFlight = true

    try {
      conversations = await getConversations($auth.token)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isRequestInFlight = false

      if (!background) {
        isLoading = false
      }
    }
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function startPolling() {
    stopPolling()

    if (typeof window === 'undefined') {
      return
    }

    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadConversations({ background: true })
      }
    }, 5000)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      void loadConversations({ background: true })
    }
  }

  function getCounterpart(conversation) {
    if (conversation.ownerId === $auth.user?.id) {
      return conversation.participant?.pseudo || 'Interlocuteur'
    }

    return conversation.owner?.pseudo || 'Interlocuteur'
  }

  onMount(() => {
    void loadConversations()
    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onDestroy(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })
</script>

<p class="summary">La boite de reception se met a jour automatiquement pour remonter les nouvelles conversations et le dernier message recu sans recharger la page.</p>

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
          <span>{conversation.ad?.title || `Annonce ${conversation.adId}`}</span>
          <span>{getCounterpart(conversation)}</span>
          <span>{new Date(conversation.updatedAt).toLocaleString('fr-FR')}</span>
        </div>
        <h2>Conversation privee</h2>
        <p>{conversation.messages[0]?.content || 'Aucun message pour le moment.'}</p>
        <button class="primary-button" type="button" on:click={() => navigate(`/conversations/${conversation.id}`)}>
          Ouvrir la conversation
        </button>
      </article>
    {/each}
  {/if}
</div>