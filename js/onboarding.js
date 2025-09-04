// Post-login onboarding modal
(function(){
  const STORAGE_KEY = 'onboarding_shown_v2';

  async function saveDismissPreference() {
    try {
      const auth = window.firebaseAuth;
      if (!auth || !auth.isAuthenticated()) return; // silent fail if not logged in
      const token = await auth.getIdToken();
      await fetch('/api/user/preferences/onboarding.dismissed', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ value: true })
      }).catch(() => {});
    } catch(_) {}
  }

  async function fetchDismissPreference() {
    try {
      const auth = window.firebaseAuth;
      if (!auth || !auth.isAuthenticated()) return null;
      const token = await auth.getIdToken();
      const res = await fetch('/api/user/preferences/onboarding.dismissed', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.value ?? null; // expected to be boolean or null
    } catch(_) { return null; }
  }

  function createOnboardingModal() {
    if (document.getElementById('onboarding-modal')) return;
    const html = `
      <div id="onboarding-modal" class="onboarding-modal hidden" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div class="onboarding-modal-content">
          <div class="onboarding-header">
            <h2 id="onboarding-title">Welcome to Dandelion</h2>
            <button class="onboarding-close" id="onboarding-close-btn" aria-label="Close">&times;</button>
          </div>
          <div class="onboarding-body">
            <ol class="onboarding-steps">
              <li><strong>Say hello</strong> and share a short memory or topic you’d like to talk about.</li>
              <li>The <strong>Collaborator</strong> will respond warmly and ask gentle follow-ups.</li>
              <li><strong>Dandelion</strong> quietly extracts <em>People, Dates, Places, Relationships, Events</em> into the panel on the right.</li>
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
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    // Bind events
    const close = () => {
      const modal = document.getElementById('onboarding-modal');
      if (!modal) return;
      modal.classList.add('hidden');
      modal.classList.remove('flex-visible');
      document.body.style.overflow = 'auto';
      const dont = document.getElementById('onboarding-dontshow');
      if (dont && dont.checked) {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch(_) {}
        // Persist to server for cross-device persistence
        saveDismissPreference();
      }
    };

    document.getElementById('onboarding-close-btn').addEventListener('click', close);
    document.getElementById('onboarding-start-btn').addEventListener('click', close);
    document.getElementById('onboarding-modal').addEventListener('click', (e) => {
      if (e.target.id === 'onboarding-modal') close();
    });
  }

  function showOnboarding() {
    createOnboardingModal();
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;
    try { console.log('[onboarding] show modal @', Date.now()); } catch (_) {}
    modal.classList.remove('hidden');
    modal.classList.add('flex-visible');
    document.body.style.overflow = 'hidden';
  }

  // Public API used by auth-ui on successful login
  window.showPostLoginOnboarding = function(user){
    // Show only once per browser unless user re-enables via settings later
    try {
      const skip = localStorage.getItem(STORAGE_KEY) === '1';
      if (skip) return;
    } catch(_) {}

    const loader = document.getElementById('app-loader');
    const loaderActive = loader && loader.style.display !== 'none';
    if (loaderActive) {
      // Wait for app bootstrap to complete
      const onReady = () => {
        window.removeEventListener('app-bootstrap-complete', onReady);
        // Slight delay to ensure UI is interactive
        setTimeout(() => showOnboarding(), 200);
      };
      try { console.log('[onboarding] waiting for app-bootstrap-complete @', Date.now()); } catch (_) {}
      window.addEventListener('app-bootstrap-complete', onReady, { once: true });
      return;
    }

    // Small delay to let the chat UI render before showing
    setTimeout(() => {
      showOnboarding();
    }, 300);
  };

  // Auto-bind to Firebase auth on pages that include this script (e.g., chat.html)
  function bindAutoShow() {
    const auth = window.firebaseAuth;
    if (!auth || typeof auth.onAuthStateChanged !== 'function') return;
    let initialized = false;
    auth.onAuthStateChanged(async (user) => {
      if (!user || initialized) return;
      initialized = true;
      // Always attempt to show unless locally dismissed
      try { console.log('[onboarding] auth detected, invoking showPostLoginOnboarding @', Date.now()); } catch (_) {}
      window.showPostLoginOnboarding(user);
    });
  }

  if (window.firebaseAuth) {
    bindAutoShow();
  } else {
    window.addEventListener('firebase-ready', bindAutoShow, { once: true });
  }
})();
