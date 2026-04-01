<script>
  import { auth, isAuthenticated } from './lib/stores/auth.js'
  import { logoutUser } from './lib/api.js'
  import { navigate, route } from './lib/router.js'
  import AdsPage from './pages/AdsPage.svelte'
  import AdDetailPage from './pages/AdDetailPage.svelte'
  import ConversationPage from './pages/ConversationPage.svelte'
  import HomePage from './pages/HomePage.svelte'
  import InboxPage from './pages/InboxPage.svelte'
  import LoginPage from './pages/LoginPage.svelte'
  import NewAdPage from './pages/NewAdPage.svelte'
  import ProfilePage from './pages/ProfilePage.svelte'
  import RegisterPage from './pages/RegisterPage.svelte'

  const links = [
    { href: '/', label: 'Accueil' },
    { href: '/ads', label: 'Annonces' },
    { href: '/ads/new', label: 'Publier' },
    { href: '/profile', label: 'Profil' },
    { href: '/inbox', label: 'Inbox' },
    { href: '/login', label: 'Connexion' },
    { href: '/register', label: 'Inscription' },
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

  function resolveView(currentRoute) {
    if (currentRoute.path === '/') {
      return { page: 'home', title: 'Accueil' }
    }

    if (currentRoute.path === '/ads') {
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

    return { page: 'home', title: 'Accueil' }
  }

  $: view = resolveView($route)
</script>

<div class="shell">
  <header class="topbar">
    <a href="/" class="brand" on:click={(event) => onNavigate(event, '/')}>
      Greglist
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
      <p class="eyebrow">Greglist</p>
      <h1>{view.title}</h1>

      {#if view.page === 'home'}
        <HomePage />
      {:else if view.page === 'ads'}
        <AdsPage />
      {:else if view.page === 'new-ad'}
        <NewAdPage />
      {:else if view.page === 'ad-detail'}
        <AdDetailPage adId={view.adId} />
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
