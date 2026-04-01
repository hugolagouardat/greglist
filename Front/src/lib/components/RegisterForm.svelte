<script>
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let pseudo = ''
  let city = ''
  let bio = ''
  let password = ''

  function submitForm() {
    dispatch('submit', {
      pseudo,
      city,
      bio,
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
    <span>Ville</span>
    <input bind:value={city} name="city" minlength="2" required />
  </label>

  <label class="full-width">
    <span>Bio</span>
    <textarea bind:value={bio} name="bio" rows="4"></textarea>
  </label>

  <label class="full-width">
    <span>Mot de passe</span>
    <input bind:value={password} type="password" name="password" minlength="8" required />
  </label>

  <button class="primary-button full-width" type="submit">Créer mon compte</button>
</form>