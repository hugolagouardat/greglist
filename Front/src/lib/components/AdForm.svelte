<script>
  import { onDestroy } from 'svelte'
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
  let galleryItems = []
  let imageMessage = ''
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
    galleryItems = (initialValue.images || []).map((image) => ({
      kind: 'existing',
      id: image.id,
      label: image.originalName,
      url: image.url,
    }))
    syncedInitialValue = initialValue
  }

  $: if (priceMode === 'FREE') {
    priceValue = ''
  }

  onDestroy(() => {
    galleryItems.forEach((item) => {
      if (item.kind === 'new') {
        URL.revokeObjectURL(item.url)
      }
    })
  })

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

  function createClientId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }

    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function handleImagesSelected(event) {
    const nextFiles = Array.from(event.currentTarget.files || [])
    const remainingSlots = Math.max(0, 10 - galleryItems.length)

    if (!nextFiles.length) {
      return
    }

    if (remainingSlots === 0) {
      imageMessage = 'Maximum 10 images par annonce.'
      event.currentTarget.value = ''
      return
    }

    const acceptedFiles = nextFiles.slice(0, remainingSlots)
    const nextItems = acceptedFiles.map((file) => ({
      kind: 'new',
      clientId: createClientId(),
      file,
      label: file.name,
      url: URL.createObjectURL(file),
    }))

    imageMessage = nextFiles.length > acceptedFiles.length ? 'Certaines images ont été ignorées: limite de 10.' : ''
    galleryItems = [...galleryItems, ...nextItems]
    event.currentTarget.value = ''
  }

  function removeImage(item) {
    if (item.kind === 'new') {
      URL.revokeObjectURL(item.url)
    }

    galleryItems = galleryItems.filter((entry) => entry !== item)
  }

  function moveImage(index, offset) {
    const nextIndex = index + offset

    if (nextIndex < 0 || nextIndex >= galleryItems.length) {
      return
    }

    const nextItems = [...galleryItems]
    const [item] = nextItems.splice(index, 1)
    nextItems.splice(nextIndex, 0, item)
    galleryItems = nextItems
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
      imageOrder: galleryItems.map((item) => (
        item.kind === 'existing'
          ? { type: 'existing', id: item.id }
          : { type: 'new', clientId: item.clientId }
      )),
      newImageClientIds: galleryItems.filter((item) => item.kind === 'new').map((item) => item.clientId),
      images: galleryItems.filter((item) => item.kind === 'new').map((item) => item.file),
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

  <div class="full-width stack-gap media-manager">
    <div class="section-heading">
      <h2>Galerie</h2>
      <p>Ajoute jusqu’à 10 images et ajuste leur ordre d’affichage.</p>
    </div>

    <label class="upload-dropzone">
      <span>Déposer ou sélectionner des images</span>
      <small>Formats acceptés: svg, png, avif, jpg, jpeg, webp.</small>
      <input type="file" accept=".svg,.png,.avif,.jpg,.jpeg,.webp,image/*" multiple on:change={handleImagesSelected} />
    </label>

    {#if galleryItems.length}
      <div class="image-manager-grid">
        {#each galleryItems as item, index}
          <article class="managed-image-card">
            <img src={item.url} alt={item.label} />
            <div class="managed-image-body">
              <strong>{index + 1}. {item.label}</strong>
              <div class="action-row compact-row">
                <button class="ghost-button" type="button" on:click={() => moveImage(index, -1)} disabled={index === 0}>
                  ←
                </button>
                <button class="ghost-button" type="button" on:click={() => moveImage(index, 1)} disabled={index === galleryItems.length - 1}>
                  →
                </button>
                <button class="ghost-button danger-button" type="button" on:click={() => removeImage(item)}>
                  Retirer
                </button>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty-media-state">
        <p>Aucune image pour l’instant. L’annonce restera visible avec un fallback visuel propre.</p>
      </div>
    {/if}

    {#if imageMessage}
      <p class="error-text">{imageMessage}</p>
    {/if}
  </div>

  <button class="primary-button full-width" type="submit">{submitLabel}</button>
</form>