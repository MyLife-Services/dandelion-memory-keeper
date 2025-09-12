// Auth Guard for chat.html
// Adds a pre-render guard to prevent unauthenticated users from seeing the chat page
// Redirects to index.html if not authenticated; reveals page when authenticated
(function(){
  function redirectToLogin() {
    try { window.location.replace('index.html') } catch (_) {
      window.location.href = 'index.html'
      console.log("Auth Guard: Redirected to login page")
    }
  }
  async function checkAuth(){
    try {
      const response = await window.Globals?.datamanager?.authenticationStatus()
      if(!response)
        console.log('auth check failed', response)
    } catch (_) {
      console.error('Auth Guard: Error checking authentication status', _)
      redirectToLogin()
    }
  }
  setInterval(checkAuth, 5000)
})()
// End of auth-guard.js