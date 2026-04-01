<script>
  import { logoutUser } from '../lib/api.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { navigate } from '../lib/router.js'

  export const title = 'Profil'

  let errorMessage = ''

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
</script>

<p class="summary">Cette vue affiche les informations du compte connecté et servira ensuite de point d’entrée pour gérer son activité.</p>

{#if $isAuthenticated}
  <div class="placeholder-grid">
    <article>
      <h2>Pseudo</h2>
      <p>{$auth.user?.pseudo}</p>
    </article>
    <article>
      <h2>Ville</h2>
      <p>{$auth.user?.city || 'Non renseignée'}</p>
    </article>
    <article class="full-width">
      <h2>Bio</h2>
      <p>{$auth.user?.bio || 'Aucune bio pour le moment.'}</p>
    </article>
    <article class="full-width stack-gap">
      <h2>Session</h2>
      <p>Le front utilise le store global pour mémoriser la session active.</p>
      <button class="ghost-button inline-button" type="button" on:click={handleLogout}>Se déconnecter</button>
      {#if errorMessage}
        <p class="error-text">{errorMessage}</p>
      {/if}
    </article>
  </div>
{:else}
  <div class="placeholder-card">
    <p>Aucun utilisateur connecté pour le moment.</p>
  </div>
{/if}