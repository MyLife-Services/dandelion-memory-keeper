/**
 * Simple Splash Page Controller
 * Handles the landing page experience and navigation to chat
 */
class SplashPage {
    /* constructor and init */
    constructor(){
        this.setupEventListeners()
        this.setupVideo()
        this.checkReturningUser()
    }
    /* methods */
    authError(message){
        const authForm = document.querySelector('.auth-form')
        if(!authForm){
            alert(message)
            return
        }
        let errorEl = document.querySelector('.auth-error')
        if(!errorEl){
            errorEl = document.createElement('div')
            errorEl.className = 'auth-error'
            authForm.appendChild(errorEl)
        }
        errorEl.textContent = message
        errorEl.style.display = 'block'
        setTimeout(_=>{ errorEl.style.display = 'none' }, 5000) // Auto-hide after 5 seconds
    }
    async authSubmit(){
        const authSubmitBtn = document.getElementById('auth-submit-btn')
        const email = document.getElementById('email')?.value
        const password = document.getElementById('password')?.value
        // Basic validation
        if (!email?.length || !password?.length) {
            this.authError('Please fill in all required fields')
            return
        }
        // Add loading state
        authSubmitBtn.classList.add('loading')
        authSubmitBtn.textContent = 'Processing...'
        localStorage.setItem('story-collection-used', 'true')
        try { // Authenticate with Dandelion
            const result = await window.Globals.datamanager.submitPassphrase(password, email)
            if(!result){
                this.authError('Authentication failed. Please try again.')
                return
            }
            this.continueToApp()
        } catch(error) {
            console.error('❌ Auth error:', error)
            this.authError('Authentication failed. Please try again or contact support above.')
        } finally {
            authSubmitBtn.classList.remove('loading')
            authSubmitBtn.textContent = 'Sign In'
        }
    }
    checkReturningUser(){
        const hasUsedApp = localStorage.getItem('story-collection-used') === 'true'
        const hasStories = localStorage.getItem('story_session_exists') === 'true'
        if(hasUsedApp || hasStories){
            console.log('👋 Returning user detected')
            this.showReturningUserContent()
        } else
            this.showNewUserContent()
    }
    closeModal(){
        document.getElementById('how-it-works-modal')?.classList.add('hidden')
        document.body.style.overflow = ''
    }
    continueToApp(){
        document.body.style.opacity = '0'
        document.body.style.transition = 'opacity 0.5s ease-out'
        setTimeout(()=>{
            window.location.href = 'chat.html'
        }, 500)
    }
    openHowItWorksModal(){
        const modal = document.getElementById('how-it-works-modal')
        if(!modal)
            return
        modal.classList.remove('hidden')
        modal.querySelector('#how-it-works-title')?.focus() // focus heading for accessibility
        document.body.style.overflow = 'hidden'
    }
    setupEventListeners(){
        document.getElementById('auth-submit-btn')?.addEventListener('click', e=>{
            e.preventDefault()
            this.authSubmit()
        })
        document.getElementById('how-it-works-link')?.addEventListener('click', e=>{
            e.preventDefault()
            this.openHowItWorksModal()
        })
        document.querySelectorAll('.nav-link').forEach(link=>{
            link.addEventListener('click', e=>{
                const href = link.getAttribute('href') || ''
                if(href.startsWith('#') && link.id !== 'how-it-works-link'){
                    e.preventDefault()
                    this.handleNavigation(href)
                }
            })
        })
        /* modal listeners */
        document.getElementById('how-it-works-modal')?.addEventListener('click', e=>{
            if(e.target && (e.target.getAttribute('data-close') === 'true'))
                this.closeModal()
        })
        /* Global key listener for Enter/Escape */
        document.addEventListener('keydown', e=>{
            if(e.key === 'Enter'){
                const activeElement = document.activeElement
                if(
                        activeElement && (activeElement.classList.contains('auth-submit-btn')
                    ||  activeElement.classList.contains('auth-toggle-btn'))
                )
                    activeElement.click()
            }
            if(e.key === 'Escape')
                this.closeModal()
        })
    }
    setupVideo(){
        const video = document.getElementById('background-video')
        const videoBackground = document.querySelector('.video-background')
        // Check if video source exists
        const videoSources = video.querySelectorAll('source')
        let hasValidSource = false
        videoSources.forEach(source=>{
            if(source.src && source.src.trim() !== '')
                hasValidSource = true
        })
        if(!hasValidSource){
            console.log('🎨 No background video, using gradient background')
            document.body.classList.remove('has-video')
            return
        }
        /* load and play video */
        console.log('🎥 Background video detected and enabled')
        document.body.classList.add('has-video')
        video.muted = true
        video.loop = true
        video.playsInline = true
        // video event handlers
        video.addEventListener('loadeddata', _=>{
            console.log('✅ Background video loaded successfully')
        })
        video.addEventListener('error', () => {
            console.warn('⚠️ Background video failed to load, using gradient fallback')
            document.body.classList.remove('has-video')
        })
        video.play()
            .catch(e=>{
                console.log('Video autoplay prevented by browser', e.message)
            })
    }
    showNewUserContent() {
        const cardHeader = document.querySelector('.card-header')
        if (cardHeader) {
            cardHeader.innerHTML = `
                <h2>Welcome to Dandelion</h2>
                <p>Share your life stories with AI agents who listen, understand, and help preserve your precious memories.</p>
            `;
        }
    }
    showReturningUserContent() {
        const cardHeader = document.querySelector('.card-header');
        if (cardHeader) {
            cardHeader.innerHTML = `
                <h2>Welcome Back!</h2>
                <p>Ready to continue sharing your stories? Your memories are waiting for you.</p>
            `;
        }
    }
    
    handleNavigation(href) {
        console.log('🧭 Navigation clicked:', href);
        
        // Smooth scroll to sections or handle navigation
        if (href.startsWith('#')) {
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            } else {
                // For now, just scroll to features for any hash link
                this.showFeatures();
            }
        }
    }
}
// Initialize splash page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 DOM loaded, initializing splash page...')
    window.splashPage = new SplashPage()
})
// Handle page visibility changes (for better mobile experience)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page became visible, ensure video is playing if available
        const video = document.getElementById('background-video');
        if (video && video.paused) {
            video.play().catch(() => {
                // Ignore autoplay errors
            });
        }
    }
});
// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SplashPage;
}
