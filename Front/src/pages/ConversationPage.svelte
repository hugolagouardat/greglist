<script>
  import { getConversationMessages } from '../lib/api.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { onMount } from 'svelte'

  export let conversationId
  export const title = 'Conversation'

  let conversation = null
  let isLoading = false
  let errorMessage = ''

  async function loadConversation() {
    if (!$isAuthenticated) {
      return
    }

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

  onMount(loadConversation)
</script>

<p class="summary">Le fil de discussion affiche l’historique complet et prépare la réponse suivante.</p>

<section class="stack-gap">
  {#if !$isAuthenticated}
    <div class="placeholder-card">
      <p>Connecte-toi pour voir cette conversation.</p>
    </div>
  {:else if isLoading}
    <div class="placeholder-card">
      <p>Chargement de la conversation...</p>
    </div>
  {:else if errorMessage}
    <div class="placeholder-card">
      <p class="error-text">{errorMessage}</p>
    </div>
  {:else if conversation}
    <div class="thread-list">
      {#each conversation.messages as message}
        <article class:thread-bubble={true} class:mine={message.senderId === $auth.user?.id}>
          <strong>{message.senderId === $auth.user?.id ? 'Moi' : 'Interlocuteur'}</strong>
          <p>{message.content}</p>
        </article>
      {/each}
    </div>

    <div class="placeholder-card stack-gap">
      <h2>Réponse</h2>
      <p>L’API actuelle expose la création du premier message et la lecture du fil. L’envoi de réponse sur une conversation existante n’est pas encore disponible côté back-end.</p>
    </div>
  {/if}
</section>