<script>
  import { createEventDispatcher } from 'svelte'
  import { adCategories, priceModes, serviceTerms } from '../adOptions.js'

  export let initialValue = null
  export let submitLabel = 'Enregistrer l’annonce'
  const dispatch = createEventDispatcher()

  let type = initialValue?.type || 'OFFER'
  let title = initialValue?.title || ''
  let description = initialValue?.description || ''
  let category = initialValue?.category || adCategories[0].value
  let city = initialValue?.city || ''
  let availability = initialValue?.availability || ''
  let priceMode = initialValue?.priceMode || 'FREE'
  let priceValue = initialValue?.priceValue ?? ''
  let selectedServiceTerms = initialValue?.serviceTerms?.length ? [...initialValue.serviceTerms] : ['REMOTE']
  let syncedInitialValue = null

  $: if (initialValue && initialValue !== syncedInitialValue) {
    type = initialValue.type
    title = initialValue.title
    description = initialValue.description
    category = initialValue.category
    city = initialValue.city
    availability = initialValue.availability || ''
    priceMode = initialValue.priceMode
    priceValue = initialValue.priceValue ?? ''
    selectedServiceTerms = initialValue.serviceTerms?.length ? [...initialValue.serviceTerms] : ['REMOTE']
    syncedInitialValue = initialValue
  }

  $: if (priceMode === 'FREE') {
    priceValue = ''
  }

  function toggleServiceTerm(term) {
    if (selectedServiceTerms.includes(term)) {
      if (selectedServiceTerms.length === 1) {
        return
      }

      selectedServiceTerms = selectedServiceTerms.filter((value) => value !== term)
      return
    }

    selectedServiceTerms = [...selectedServiceTerms, term]
  }

  function submitForm() {
    dispatch('submit', {
      type,
      title,
      description,
      category,
      city,
      availability,
      priceMode,
      priceValue,
      serviceTerms: selectedServiceTerms,
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
    <select bind:value={category} name="category">
      {#each adCategories as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
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
    <span>Mode de tarif</span>
    <select bind:value={priceMode} name="priceMode">
      {#each priceModes as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>

  {#if priceMode !== 'FREE'}
    <label>
      <span>Montant</span>
      <input bind:value={priceValue} name="priceValue" type="number" min="0" step="0.01" required />
    </label>
  {/if}

  <fieldset class="full-width checkbox-group">
    <legend>Modalités</legend>
    <div class="checkbox-row">
      {#each serviceTerms as option}
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={selectedServiceTerms.includes(option.value)}
            on:change={() => toggleServiceTerm(option.value)}
          />
          <span>{option.label}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <button class="primary-button full-width" type="submit">{submitLabel}</button>
</form>