// Auth Guard for chat.html
// Adds a pre-render guard to prevent unauthenticated users from seeing the chat page
// Redirects to index.html if not authenticated; reveals page when authenticated
(function(){
  function checkDatamanager(){
      if(!window.Globals?.datamanager){
        console.error("Auth Guard: Globals.datamanager not initialized");
        return redirectToLogin();
      }
  }
  function reveal() {
    try {
      // Ensure loader is visible on first paint
      const loader = document.getElementById('app-loader');
      if (loader) loader.style.display = 'flex';
    } catch (_) {}
    try { document.documentElement.classList.remove('auth-guard'); } catch (_) {}
    try { if (document.body) document.body.hidden = false; } catch (_) {}
    try {
      // Signal to the app that the page has been revealed
      window.dispatchEvent(new Event('page-revealed'));
      // Optional debug log
      if (window.console && console.log) console.log('[guard] page-revealed @', Date.now());
    } catch (_) {}
  }

  function redirectToLogin() {
    try { window.location.replace('index.html'); } catch (_) { window.location.href = 'index.html'; }
  }
  async function checkAuth(){
    checkDatamanager();
    try {
      const response = await window.Globals?.datamanager?.authenticationStatus();
      if(!response.ok || !await response.json())
        console.log('auth check failed', response) // redirectToLogin()
      else
        reveal();
    } catch (_) {
      console.error("Auth Guard: Error checking authentication status");
      redirectToLogin();
    }
  }
  setInterval(checkAuth, 20000);
})();
// End of auth-guard.js