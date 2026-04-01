<script>
  import { loginUser } from '../lib/api.js'
  import LoginForm from '../lib/components/LoginForm.svelte'
  import { navigate } from '../lib/router.js'
  import { auth } from '../lib/stores/auth.js'

  export const title = 'Connexion'

  let draftMessage = 'Connecte-toi pour accéder à tes annonces et messages.'
  let isSubmitting = false
  let errorMessage = ''

  async function handleSubmit(event) {
    isSubmitting = true
    errorMessage = ''

    try {
      const session = await loginUser(event.detail)
      auth.setSession(session)
      draftMessage = `Connexion réussie pour ${session.user.pseudo}.`
      navigate('/profile')
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }
</script>

<p class="summary">Connecte-toi avec ton pseudo et ton mot de passe pour accéder aux annonces et messages.</p>

<div class="placeholder-card stack-gap">
  <LoginForm on:submit={handleSubmit} />
  {#if isSubmitting}
    <p class="status-text">Connexion en cours...</p>
  {/if}
  {#if errorMessage}
    <p class="error-text">{errorMessage}</p>
  {/if}
  <p>{draftMessage}</p>
</div>