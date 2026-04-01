<script>
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let pseudo = ''
  let password = ''

  function submitForm() {
    dispatch('submit', {
      pseudo,
      password,
    })
  }
</script>

<form class="form-grid" on:submit|preventDefault={submitForm}>
  <label>
    <span>Pseudo</span>
    <input bind:value={pseudo} name="pseudo" minlength="3" required />
  </label>

  <label>
    <span>Mot de passe</span>
    <input bind:value={password} type="password" name="password" minlength="8" required />
  </label>

  <button class="primary-button full-width" type="submit">Se connecter</button>
</form>