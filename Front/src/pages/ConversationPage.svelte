<script>
  import { getConversationMessages, sendConversationMessage } from '../lib/api.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { onDestroy, onMount, tick } from 'svelte'

  export let conversationId
  export const title = 'Conversation'

  let conversation = null
  let reply = ''
  let isLoading = false
  let isSubmitting = false
  let errorMessage = ''
  let loadKey = ''
  let isRequestInFlight = false
  let pollTimer = null
  let threadElement

  async function scrollToLatestMessage() {
    await tick()

    if (threadElement) {
      threadElement.scrollTop = threadElement.scrollHeight
    }
  }

  async function loadConversation({ background = false } = {}) {
    if (!$isAuthenticated) {
      return
    }

    if (isRequestInFlight) {
      return
    }

    if (!background) {
      isLoading = true
    }

    isRequestInFlight = true

    if (!background) {
      errorMessage = ''
    }

    try {
      const nextConversation = await getConversationMessages(conversationId, $auth.token)
      const previousLastMessageId = conversation?.messages?.at(-1)?.id

      conversation = nextConversation

      if (nextConversation.messages.length && nextConversation.messages.at(-1)?.id !== previousLastMessageId) {
        await scrollToLatestMessage()
      }
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
        void loadConversation({ background: true })
      }
    }, 2500)
  }

  async function handleReply() {
    if (!reply.trim()) {
      errorMessage = 'Le message ne peut pas etre vide.'
      return
    }

    isSubmitting = true
    errorMessage = ''

    try {
      await sendConversationMessage(conversationId, reply.trim(), $auth.token)
      reply = ''
      await loadConversation()
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      void loadConversation({ background: true })
    }
  }

  onMount(() => {
    void loadConversation()
    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onDestroy(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  $: {
    const nextLoadKey = `${conversationId}:${$auth.ready ? $auth.token : 'pending'}`

    if ($auth.ready && nextLoadKey !== loadKey) {
      loadKey = nextLoadKey
      void loadConversation()
    }
  }
</script>

<p class="summary">Chaque conversation reste strictement privee entre les deux participants de l’annonce et se rafraichit automatiquement pour afficher les nouveaux messages presque en temps reel.</p>

<section class="stack-gap">
  {#if !$isAuthenticated}
    <div class="placeholder-card">
      <p>Connecte-toi pour voir cette conversation.</p>
    </div>
  {:else if isLoading}
    <div class="placeholder-card">
      <p>Chargement de la conversation...</p>
    </div>
  {:else if errorMessage && !conversation}
    <div class="placeholder-card">
      <p class="error-text">{errorMessage}</p>
    </div>
  {:else if conversation}
    <div class="placeholder-card stack-gap">
      <h2>{conversation.ad?.title || `Annonce ${conversation.adId}`}</h2>
      <p>
        Conversation entre {conversation.owner?.pseudo} et {conversation.participant?.pseudo}.
      </p>
    </div>

    <div class="thread-list" bind:this={threadElement}>
      {#each conversation.messages as message}
        <article class:thread-bubble={true} class:mine={message.senderId === $auth.user?.id}>
          <strong>{message.senderId === $auth.user?.id ? 'Moi' : 'Interlocuteur'}</strong>
          <p>{message.content}</p>
          <small>{new Date(message.createdAt).toLocaleString('fr-FR')}</small>
        </article>
      {/each}
    </div>

    <div class="placeholder-card stack-gap">
      <h2>Repondre</h2>
      <textarea bind:value={reply} rows="5" placeholder="Votre message"></textarea>
      <button class="primary-button inline-button" type="button" on:click={handleReply} disabled={isSubmitting}>
        {isSubmitting ? 'Envoi...' : 'Envoyer'}
      </button>
      {#if errorMessage}
        <p class="error-text">{errorMessage}</p>
      {/if}
    </div>
  {/if}
</section>
