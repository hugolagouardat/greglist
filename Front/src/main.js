import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { auth } from './lib/stores/auth.js'

auth.hydrate()

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
