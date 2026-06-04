<script>
  import logoUrl from './assets/greglist-logo.svg'
  import { auth, isAuthenticated } from './lib/stores/auth.js'
  import { logoutUser } from './lib/api.js'
  import { navigate, route } from './lib/router.js'
  import AdsPage from './pages/AdsPage.svelte'
  import AdDetailPage from './pages/AdDetailPage.svelte'
  import ConversationPage from './pages/ConversationPage.svelte'
  import EditAdPage from './pages/EditAdPage.svelte'
  import InboxPage from './pages/InboxPage.svelte'
  import LoginPage from './pages/LoginPage.svelte'
  import NewAdPage from './pages/NewAdPage.svelte'
  import ProfilePage from './pages/ProfilePage.svelte'
  import RegisterPage from './pages/RegisterPage.svelte'

  const guestLinks = [
    { href: '/', label: 'Annonces' },
    { href: '/login', label: 'Connexion' },
    { href: '/register', label: 'Inscription' },
  ]

  const authenticatedLinks = [
    { href: '/', label: 'Annonces' },
    { href: '/ads/new', label: 'Nouvelle annonce' },
    { href: '/profile', label: 'Profil' },
    { href: '/inbox', label: 'Inbox' },
  ]

  function onNavigate(event, href) {
    event.preventDefault()
    navigate(href)
  }

  async function handleLogout() {
    try {
      if ($auth.token) {
        await logoutUser($auth.token)
      }
    } catch {
      // keep local logout even if backend logout fails
    }

    auth.clearSession()
    navigate('/')
  }

  function isPrivatePath(path) {
    return (
      path === '/ads/new' ||
      path === '/profile' ||
      path === '/inbox' ||
      /^\/conversations\/\d+$/.test(path) ||
      /^\/ads\/\d+\/edit$/.test(path)
    )
  }

  function resolveView(currentRoute) {
    if (currentRoute.path === '/' || currentRoute.path === '/ads') {
      return { page: 'ads', title: 'Annonces' }
    }

    if (currentRoute.path === '/ads/new') {
      return { page: 'new-ad', title: 'Publier une annonce' }
    }

    if (/^\/ads\/\d+$/.test(currentRoute.path)) {
      return {
        page: 'ad-detail',
        title: 'Détail d’annonce',
        adId: Number.parseInt(currentRoute.path.split('/')[2], 10),
      }
    }

    if (/^\/ads\/\d+\/edit$/.test(currentRoute.path)) {
      return {
        page: 'edit-ad',
        title: 'Modifier une annonce',
        adId: Number.parseInt(currentRoute.path.split('/')[2], 10),
      }
    }

    if (currentRoute.path === '/profile') {
      return { page: 'profile', title: 'Profil' }
    }

    if (currentRoute.path === '/inbox') {
      return { page: 'inbox', title: 'Inbox' }
    }

    if (/^\/conversations\/\d+$/.test(currentRoute.path)) {
      return {
        page: 'conversation',
        title: 'Conversation',
        conversationId: Number.parseInt(currentRoute.path.split('/')[2], 10),
      }
    }

    if (currentRoute.path === '/login') {
      return { page: 'login', title: 'Connexion' }
    }

    if (currentRoute.path === '/register') {
      return { page: 'register', title: 'Inscription' }
    }

    return { page: 'ads', title: 'Annonces' }
  }

  $: view = resolveView($route)
  $: links = $isAuthenticated ? authenticatedLinks : guestLinks
  $: if ($auth.ready && !$isAuthenticated && isPrivatePath($route.path) && $route.path !== '/login') {
    navigate('/login')
  }
</script>

<div class="shell">
  <header class="topbar">
    <a href="/" class="brand" on:click={(event) => onNavigate(event, '/')}>
      <img src={logoUrl} alt="Greglist" class="brand-logo" />
      <span class="brand-copy">
        <strong>Greglist</strong>
        <small>Services de quartier, sans détour.</small>
      </span>
    </a>

    <nav class="menu" aria-label="Navigation principale">
      {#each links as link}
        <a
          href={link.href}
          class:active={$route.path === link.href}
          on:click={(event) => onNavigate(event, link.href)}
        >
          {link.label}
        </a>
      {/each}

      {#if $isAuthenticated}
        <button class="ghost-button" type="button" on:click={handleLogout}>Déconnexion</button>
      {/if}
    </nav>
  </header>

  <main class="viewport">
    <section class="page-frame">
      <p class="eyebrow">Marketplace locale</p>
      <h1>{view.title}</h1>

      {#if !$auth.ready}
        <div class="placeholder-card">
          <p>Chargement de la session...</p>
        </div>
      {:else if view.page === 'ads'}
        <AdsPage />
      {:else if view.page === 'new-ad'}
        <NewAdPage />
      {:else if view.page === 'ad-detail'}
        <AdDetailPage adId={view.adId} />
      {:else if view.page === 'edit-ad'}
        <EditAdPage adId={view.adId} />
      {:else if view.page === 'profile'}
        <ProfilePage />
      {:else if view.page === 'inbox'}
        <InboxPage />
      {:else if view.page === 'conversation'}
        <ConversationPage conversationId={view.conversationId} />
      {:else if view.page === 'login'}
        <LoginPage />
      {:else if view.page === 'register'}
        <RegisterPage />
      {/if}
    </section>
  </main>
</div>
