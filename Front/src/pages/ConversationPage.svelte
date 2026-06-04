<script>
  import { onMount } from 'svelte'
  import { getConversationMessages, sendConversationMessage } from '../lib/api.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'

  export let conversationId
  export const title = 'Conversation'

  let conversation = null
  let reply = ''
  let isLoading = false
  let isSubmitting = false
  let errorMessage = ''

  async function loadConversation() {
    if (!$isAuthenticated) return

    isLoading = true
    errorMessage = ''

    try {
      conversation = await getConversationMessages(conversationId, $auth.token)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
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

  onMount(loadConversation)
</script>

<p class="summary">Chaque conversation reste privee entre les deux participants de l’annonce.</p>

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

    <div class="thread-list">
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
