<script>
  import { createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher()

  let type = 'OFFER'
  let title = ''
  let description = ''
  let category = ''
  let city = ''
  let availability = ''
  let price = ''
  let terms = ''

  function submitForm() {
    dispatch('submit', {
      type,
      title,
      description,
      category,
      city,
      availability,
      price,
      terms,
    })
  }
</script>

<form class="form-grid" on:submit|preventDefault={submitForm}>
  <label>
    <span>Type</span>
    <select bind:value={type} name="type">
      <option value="OFFER">Offre</option>
      <option value="REQUEST">Demande</option>
    </select>
  </label>

  <label>
    <span>Catégorie</span>
    <input bind:value={category} name="category" required />
  </label>

  <label class="full-width">
    <span>Titre</span>
    <input bind:value={title} name="title" minlength="3" required />
  </label>

  <label class="full-width">
    <span>Description</span>
    <textarea bind:value={description} name="description" rows="5" minlength="10" required></textarea>
  </label>

  <label>
    <span>Ville</span>
    <input bind:value={city} name="city" minlength="2" required />
  </label>

  <label>
    <span>Disponibilité</span>
    <input bind:value={availability} name="availability" />
  </label>

  <label>
    <span>Tarif</span>
    <input bind:value={price} name="price" type="number" min="0" step="0.01" />
  </label>

  <label>
    <span>Modalités</span>
    <input bind:value={terms} name="terms" />
  </label>

  <button class="primary-button full-width" type="submit">Publier l’annonce</button>
</form>