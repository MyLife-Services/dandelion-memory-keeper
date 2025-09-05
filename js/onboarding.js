// Post-login onboarding modal (Firebase-free)
(function(){
  const STORAGE_KEY = 'onboarding_shown_v2'

  async function saveDismissPreference() {
    try {
      // Prefer app.js helper (cookie-session backed)
      if (typeof window.setUserPreference === 'function') {
        await window.setUserPreference('onboarding.dismissed', true)
        return
      }
    } catch (_) {}
  }

  async function fetchDismissPreference() {
    try {
      if (typeof window.getUserPreference === 'function') {
        return await window.getUserPreference('onboarding.dismissed')
      }
    } catch (_) { return null }
  }

  function createOnboardingModal() {
    if (document.getElementById('onboarding-modal')) return
    const html = `
      <div id="onboarding-modal" class="onboarding-modal hidden" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div class="onboarding-modal-content">
          <div class="onboarding-header">
            <h2 id="onboarding-title">Welcome to MemoryKeeper</h2>
            <button class="onboarding-close" id="onboarding-close-btn" aria-label="Close">&times;</button>
          </div>
          <div class="onboarding-body">
            <ol class="onboarding-steps">
              <li><strong>Say hello</strong> and share a short memory or topic you’d like to talk about.</li>
              <li>The <strong>Collaborator</strong> will respond warmly and ask gentle follow-ups.</li>
              <li>The <strong>Memory Keeper</strong> quietly extracts <em>People, Dates, Places, Relationships, Events</em> into the panel on the right.</li>
              <li>You can <strong>reset</strong> the chat anytime or <strong>export</strong> your conversation from the header.</li>
            </ol>
            <div class="onboarding-tip">Tip: short, specific memories work best. For example, “Tell me about your first job” or “What was Grandma like?”</div>
            <label class="onboarding-checkbox">
              <input type="checkbox" id="onboarding-dontshow"> Don’t show this again
            </label>
          </div>
          <div class="onboarding-footer">
            <button id="onboarding-start-btn" class="onboarding-btn primary">Got it, let’s start</button>
          </div>
        </div>
      </div>`
    document.body.insertAdjacentHTML('beforeend', html)

    // Bind events
    const close = () => {
      const modal = document.getElementById('onboarding-modal')
      if (!modal) return
      modal.classList.add('hidden')
      modal.classList.remove('flex-visible')
      document.body.style.overflow = 'auto'
      const dont = document.getElementById('onboarding-dontshow')
      if (dont && dont.checked) {
        try { localStorage.setItem(STORAGE_KEY, '1') } catch(_) {}
        // Persist to server for cross-device persistence
        saveDismissPreference()
      }
    }

    document.getElementById('onboarding-close-btn').addEventListener('click', close)
    document.getElementById('onboarding-start-btn').addEventListener('click', close)
    document.getElementById('onboarding-modal').addEventListener('click', (e) => {
      if (e.target.id === 'onboarding-modal') close()
    })
  }

  function showOnboarding() {
    createOnboardingModal()
    const modal = document.getElementById('onboarding-modal')
    if (!modal) return
    try { console.log('[onboarding] show modal @', Date.now()) } catch (_) {}
    modal.classList.remove('hidden')
    modal.classList.add('flex-visible')
    document.body.style.overflow = 'hidden'
  }

  // Public API (kept the same signature)
  window.showPostLoginOnboarding = async function(_user){
    // Local skip
    try {
      const skip = localStorage.getItem(STORAGE_KEY) === '1'
      if (skip) return
    } catch(_) {}

    // Server skip (durable preference)
    try {
      const dismissed = await fetchDismissPreference()
      if (dismissed === true) {
        try { localStorage.setItem(STORAGE_KEY, '1') } catch(_) {}
        return
      }
    } catch (_) {}

    // If loader is up, wait for bootstrap to complete
    const loader = document.getElementById('app-loader')
    const loaderActive = loader && loader.style.display !== 'none'
    if (loaderActive) {
      const onReady = () => {
        window.removeEventListener('app-bootstrap-complete', onReady)
        setTimeout(() => showOnboarding(), 200)
      }
      try { console.log('[onboarding] waiting for app-bootstrap-complete @', Date.now()) } catch (_) {}
      window.addEventListener('app-bootstrap-complete', onReady, { once: true })
      return
    }

    // Slight delay to let chat UI render
    setTimeout(() => showOnboarding(), 300)
  }

  // Firebase-free auto show: run after the app signals readiness
  function bindAutoShow() {
    const onReady = () => {
      window.removeEventListener('app-bootstrap-complete', onReady)
      window.showPostLoginOnboarding()
    }
    window.addEventListener('app-bootstrap-complete', onReady, { once: true })
  }

  bindAutoShow()
})()
// End of onboarding.js