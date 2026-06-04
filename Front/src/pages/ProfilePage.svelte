<script>
  import { onMount } from 'svelte'
  import {
    deleteAd,
    deleteAvatar,
    deleteCurrentUser,
    getCurrentUser,
    getMyAds,
    logoutUser,
    publishAd,
    unpublishAd,
    updateCurrentUser,
    uploadAvatar,
  } from '../lib/api.js'
  import { formatCategory, formatPrice, formatPriceMode, formatServiceTerms } from '../lib/adOptions.js'
  import { auth, isAuthenticated } from '../lib/stores/auth.js'
  import { formatAdType, getAvatarUrl, getCoverImage } from '../lib/media.js'
  import { navigate } from '../lib/router.js'

  export const title = 'Profil'

  let profile = null
  let ads = []
  let isLoading = false
  let isSavingProfile = false
  let isUploadingAvatar = false
  let errorMessage = ''
  let statusMessage = ''
  let pseudo = ''
  let city = ''
  let bio = ''
  let currentPassword = ''
  let newPassword = ''
  let avatarFile = null

  async function loadDashboard() {
    if (!$isAuthenticated) {
      profile = null
      ads = []
      return
    }

    isLoading = true
    errorMessage = ''

    try {
      const [profileResponse, nextAds] = await Promise.all([
        getCurrentUser($auth.token),
        getMyAds($auth.token),
      ])

      profile = profileResponse.user
      ads = nextAds
      pseudo = profile.pseudo || ''
      city = profile.city || ''
      bio = profile.bio || ''
      auth.patchUser(profile)
    } catch (error) {
      errorMessage = error.message
    } finally {
      isLoading = false
    }
  }

  async function handlePublish(adId) {
    try {
      const updatedAd = await publishAd(adId, $auth.token)
      ads = ads.map((ad) => (ad.id === adId ? updatedAd : ad))
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleUnpublish(adId) {
    try {
      const updatedAd = await unpublishAd(adId, $auth.token)
      ads = ads.map((ad) => (ad.id === adId ? updatedAd : ad))
    } catch (error) {
      errorMessage = error.message
    }
  }

  async function handleDelete(adId) {
    try {
      await deleteAd(adId, $auth.token)
      ads = ads.filter((ad) => ad.id !== adId)
    } catch (error) {
      errorMessage = error.message
    }
  }

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

  function handleAvatarSelection(event) {
    avatarFile = event.currentTarget.files?.[0] || null
  }

  async function handleProfileSave() {
    isSavingProfile = true
    errorMessage = ''
    statusMessage = ''

    try {
      const payload = {
        pseudo,
        city,
        bio,
      }

      if (currentPassword.trim() || newPassword.trim()) {
        payload.currentPassword = currentPassword
        payload.newPassword = newPassword
      }

      const response = await updateCurrentUser(payload, $auth.token)
      profile = response.user
      auth.patchUser(response.user)
      currentPassword = ''
      newPassword = ''
      statusMessage = 'Profil mis à jour.'
    } catch (error) {
      errorMessage = error.message
    } finally {
      isSavingProfile = false
    }
  }

  async function handleAvatarUpload() {
    if (!avatarFile) {
      errorMessage = 'Sélectionne une image de profil avant l’envoi.'
      return
    }

    isUploadingAvatar = true
    errorMessage = ''
    statusMessage = ''

    try {
      const response = await uploadAvatar(avatarFile, $auth.token)
      profile = response.user
      auth.patchUser(response.user)
      avatarFile = null
      statusMessage = 'Avatar mis à jour.'
    } catch (error) {
      errorMessage = error.message
    } finally {
      isUploadingAvatar = false
    }
  }

  async function handleAvatarDelete() {
    isUploadingAvatar = true
    errorMessage = ''
    statusMessage = ''

    try {
      const response = await deleteAvatar($auth.token)
      profile = response.user
      auth.patchUser(response.user)
      avatarFile = null
      statusMessage = 'Avatar supprimé.'
    } catch (error) {
      errorMessage = error.message
    } finally {
      isUploadingAvatar = false
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Supprimer définitivement ce compte et toutes ses ressources ?')) {
      return
    }

    errorMessage = ''

    try {
      await deleteCurrentUser($auth.token)
      auth.clearSession()
      navigate('/')
    } catch (error) {
      errorMessage = error.message
    }
  }

  onMount(loadDashboard)
</script>

<p class="summary">Gère ici tout le compte: informations personnelles, image de profil, sécurité, suppression de compte et pilotage complet de tes annonces.</p>

{#if $isAuthenticated}
  <div class="stack-gap">
    <section class="profile-layout">
      <article class="placeholder-card stack-gap profile-sidebar">
        <div class="profile-avatar-panel">
          {#if getAvatarUrl(profile)}
            <img src={getAvatarUrl(profile)} alt={profile?.pseudo || 'Avatar'} class="profile-avatar-large" />
          {:else}
            <div class="avatar-fallback profile-avatar-large">{profile?.pseudo?.slice(0, 1) || '?'}</div>
          {/if}

          <div>
            <h2>{profile?.pseudo || $auth.user?.pseudo}</h2>
            <p>{profile?.city || 'Ville non renseignée'}</p>
            <p>{profile?.bio || 'Ajoute une bio pour te présenter.'}</p>
          </div>
        </div>

        <label class="upload-dropzone compact-dropzone">
          <span>Changer l’image de profil</span>
          <small>{avatarFile ? avatarFile.name : 'Choisis un fichier image.'}</small>
          <input type="file" accept=".svg,.png,.avif,.jpg,.jpeg,.webp,image/*" on:change={handleAvatarSelection} />
        </label>

        <div class="action-row">
          <button class="primary-button" type="button" on:click={handleAvatarUpload} disabled={isUploadingAvatar || !avatarFile}>
            {isUploadingAvatar ? 'Envoi...' : 'Mettre à jour la photo'}
          </button>
          <button class="ghost-button" type="button" on:click={handleAvatarDelete} disabled={isUploadingAvatar || profile?.avatar?.isDefault}>
            Supprimer la photo
          </button>
        </div>

        <div class="action-row">
          <button class="primary-button" type="button" on:click={() => navigate('/ads/new')}>Nouvelle annonce</button>
          <button class="ghost-button inline-button" type="button" on:click={handleLogout}>Se déconnecter</button>
        </div>
      </article>

      <article class="placeholder-card stack-gap">
        <div class="section-heading">
          <h2>Informations du compte</h2>
          <p>Modifie ton pseudo, ta ville, ta bio et ton mot de passe si nécessaire.</p>
        </div>

        <div class="form-grid">
          <label>
            <span>Pseudo</span>
            <input bind:value={pseudo} minlength="3" />
          </label>
          <label>
            <span>Ville</span>
            <input bind:value={city} minlength="2" />
          </label>
          <label class="full-width">
            <span>Bio</span>
            <textarea bind:value={bio} rows="4"></textarea>
          </label>
          <label>
            <span>Mot de passe actuel</span>
            <input bind:value={currentPassword} type="password" minlength="8" />
          </label>
          <label>
            <span>Nouveau mot de passe</span>
            <input bind:value={newPassword} type="password" minlength="8" />
          </label>
        </div>

        <div class="action-row">
          <button class="primary-button" type="button" on:click={handleProfileSave} disabled={isSavingProfile}>
            {isSavingProfile ? 'Enregistrement...' : 'Enregistrer le profil'}
          </button>
          <button class="ghost-button danger-button" type="button" on:click={handleDeleteAccount}>
            Supprimer le compte
          </button>
        </div>
      </article>
    </section>

    <section class="stack-gap">
      <h2>Mes annonces</h2>

      {#if isLoading}
        <div class="placeholder-card">
          <p>Chargement des annonces...</p>
        </div>
      {:else if !ads.length}
        <div class="placeholder-card">
          <p>Aucune annonce pour le moment.</p>
        </div>
      {:else}
        <div class="card-grid listing-grid">
          {#each ads as ad}
            <article class="listing-card interactive-card">
              <div class="listing-media">
                {#if getCoverImage(ad)}
                  <img src={getCoverImage(ad).url} alt={ad.title} />
                {:else}
                  <div class="fallback-media">
                    <strong>{ad.title.slice(0, 1)}</strong>
                    <span>Sans image</span>
                  </div>
                {/if}
              </div>

              <div class="listing-card-body">
                <div class="card-row-between">
                  <p class="pill">{formatAdType(ad.type)}</p>
                  <span class="muted-chip">{ad.status === 'PUBLISHED' ? 'Publiée' : 'Brouillon'}</span>
                </div>

                <h2>{ad.title}</h2>
                <p class="card-excerpt">{ad.description}</p>

                <div class="card-meta">
                  <span>{formatCategory(ad.category)}</span>
                  <span>{ad.city}</span>
                  <span>{formatPrice(ad)}</span>
                  {#if ad.priceMode !== 'FREE'}
                    <span>{formatPriceMode(ad.priceMode)}</span>
                  {/if}
                  <span>{formatServiceTerms(ad.serviceTerms)}</span>
                </div>

                <div class="action-row">
                  <button class="ghost-button" type="button" on:click={() => navigate(`/ads/${ad.id}`)}>Voir</button>
                  <button class="ghost-button" type="button" on:click={() => navigate(`/ads/${ad.id}/edit`)}>Modifier</button>
                  {#if ad.status === 'PUBLISHED'}
                    <button class="ghost-button" type="button" on:click={() => handleUnpublish(ad.id)}>Dépublier</button>
                  {:else}
                    <button class="primary-button" type="button" on:click={() => handlePublish(ad.id)}>Publier</button>
                  {/if}
                  <button class="ghost-button danger-button" type="button" on:click={() => handleDelete(ad.id)}>Supprimer</button>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    {#if errorMessage || statusMessage}
      <div class="placeholder-card">
        {#if errorMessage}
          <p class="error-text">{errorMessage}</p>
        {/if}
        {#if statusMessage}
          <p class="status-text">{statusMessage}</p>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div class="placeholder-card">
    <p>Connecte-toi pour voir ton profil.</p>
  </div>
{/if}