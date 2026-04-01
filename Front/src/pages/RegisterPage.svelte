<script>
  import { registerUser } from '../lib/api.js'
  import RegisterForm from '../lib/components/RegisterForm.svelte'
  import { navigate } from '../lib/router.js'
  import { auth } from '../lib/stores/auth.js'

  export const title = 'Inscription'

  let draftMessage = 'Remplis le formulaire pour créer ton compte.'
  let isSubmitting = false
  let errorMessage = ''

  async function handleSubmit(event) {
    isSubmitting = true
    errorMessage = ''

    try {
      const session = await registerUser(event.detail)
      auth.setSession(session)
      draftMessage = `Bienvenue ${session.user.pseudo}.`
      navigate('/profile')
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSubmitting = false
    }
  }
</script>

<p class="summary">Crée un compte avec un pseudo, une ville, une bio facultative et un mot de passe.</p>

<div class="placeholder-card stack-gap">
  <RegisterForm on:submit={handleSubmit} />
  {#if isSubmitting}
    <p class="status-text">Création du compte en cours...</p>
  {/if}
  {#if errorMessage}
    <p class="error-text">{errorMessage}</p>
  {/if}
  <p>{draftMessage}</p>
</div>