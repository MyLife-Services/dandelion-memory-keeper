/**
 * Simple Splash Page Controller
 * Handles the landing page experience and navigation to chat
 */

class SplashPage {
    constructor() {
        this.currentAuthMode = 'signin';
        this.init();
    }

    // ===== Modal helpers =====
    setupModalListeners() {
        const modal = document.getElementById('how-it-works-modal');
        if (!modal) return;

        // Close on backdrop or close button
        modal.addEventListener('click', (e) => {
            const target = e.target;
            if (target && (target.getAttribute('data-close') === 'true')) {
                this.closeModal();
            }
        });
    }

    openHowItWorksModal() {
        const modal = document.getElementById('how-it-works-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        // focus heading for accessibility
        const title = modal.querySelector('#how-it-works-title');
        if (title) title.focus?.();
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        const modal = document.getElementById('how-it-works-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    init() {
        console.log('🎬 Splash page initializing...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // If already authenticated, go straight to app
        const redirectIfAuthed = () => {
            try {
                if (window.firebaseAuth && window.firebaseAuth.isAuthenticated()) {
                    this.continueToApp();
                }
            } catch (_) {}
        };
        if (window.firebaseAuth) {
            redirectIfAuthed();
            // Also watch for auth becoming available/logged in
            window.firebaseAuth.onAuthStateChanged((user) => {
                if (user) this.continueToApp();
            });
        } else {
            window.addEventListener('firebase-ready', redirectIfAuthed, { once: true });
        }
        
        // Set up background video
        this.setupBackgroundVideo();
        
        // Check if user is returning
        this.checkReturningUser();
    }

    setupEventListeners() {
        // Auth toggle buttons
        const authToggleBtns = document.querySelectorAll('.auth-toggle-btn');
        authToggleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleAuthToggle(e.target.dataset.mode);
            });
        });
        // Auth submit button
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        if (authSubmitBtn) {
            authSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleAuthSubmit();
            });
        }
        // How it Works link opens modal
        const howItWorksLink = document.getElementById('how-it-works-link');
        if (howItWorksLink) {
            howItWorksLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.openHowItWorksModal();
            });
        }
        // In-page hash navigation for other nav links (do not block mailto links)
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href') || '';
                if (href.startsWith('#') && link.id !== 'how-it-works-link') {
                    e.preventDefault();
                    this.handleNavigation(href);
                }
            });
        });
        // Modal listeners
        this.setupModalListeners();
        // Handle keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const activeElement = document.activeElement;
                if (activeElement && (activeElement.classList.contains('auth-submit-btn') || activeElement.classList.contains('auth-toggle-btn'))) {
                    activeElement.click();
                }
            }
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    checkReturningUser() {
        // Check if user has used the app before
        const hasUsedApp = localStorage.getItem('story-collection-used') === 'true';
        const hasStories = localStorage.getItem('story_session_exists') === 'true';
        
        if (hasUsedApp || hasStories) {
            console.log('👋 Returning user detected');
            this.showReturningUserContent();
        } else {
            console.log('🆕 New user, showing welcome content');
            this.showNewUserContent();
        }
    }

    showNewUserContent() {
        const cardHeader = document.querySelector('.card-header');
        if (cardHeader) {
            cardHeader.innerHTML = `
                <h2>Welcome to MemoryKeeper</h2>
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

    showFeatures() {
        // Scroll to features section
        const featuresGrid = document.querySelector('.features-grid');
        if (featuresGrid) {
            featuresGrid.scrollIntoView({ 
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    handleAuthToggle(mode) {
        console.log('🔄 Auth mode changed to:', mode);
        
        const isSignUp = mode === 'signup';
        
        // Update button styles
        const authToggleBtns = document.querySelectorAll('.auth-toggle-btn');
        authToggleBtns.forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Toggle confirm password and forgot password
        const confirmPasswordSection = document.getElementById('confirm-password-section');
        const forgotPasswordLink = document.getElementById('forgot-password-link');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        
        if (isSignUp) {
            confirmPasswordSection?.classList.remove('hidden');
            forgotPasswordLink?.classList.add('hidden');
            if (authSubmitBtn) authSubmitBtn.textContent = 'Create Account';
        } else {
            confirmPasswordSection?.classList.add('hidden');
            forgotPasswordLink?.classList.remove('hidden');
            if (authSubmitBtn) authSubmitBtn.textContent = 'Sign In';
        }
        
        this.currentAuthMode = mode;
    }

    async handleAuthSubmit() {
        console.log('🔐 Auth submit clicked');
        
        const email = document.getElementById('email')?.value;
        const password = document.getElementById('password')?.value;
        const confirmPassword = document.getElementById('confirm-password')?.value;
        const isSignUp = this.currentAuthMode === 'signup';
        
        // Basic validation
        if (!email || !password) {
            this.showAuthError('Please fill in all required fields');
            return;
        }
        
        if (isSignUp && password !== confirmPassword) {
            this.showAuthError('Passwords do not match');
            return;
        }
        // Add loading state
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        if (authSubmitBtn) {
            authSubmitBtn.classList.add('loading');
            authSubmitBtn.textContent = 'Processing...';
        }
        // Mark that user has started using the app
        localStorage.setItem('story-collection-used', 'true');
        // Authenticate with Dandelion
        try {
            let avatarName = 'Guest',
                humanName = 'Guest User',
                type = 'registration'; // default type
            console.log('📧 Submitting auth for:', isSignUp, password);
            const result = isSignUp
                ? await window.Globals.datamanager.submitSignup({ avatarName, email, humanName, type })
                : await window.Globals.datamanager.submitPassphrase(password, email);
            if(!result){
                this.showAuthError('Authentication failed. Please try again.');
                return;
            }
            console.log(`✅ ${ isSignUp ? 'Account created' : 'Signed in' } successfully!`);
            this.continueToApp();
        } catch (error) {
            console.error('❌ Auth error:', error);
            this.showAuthError('Authentication failed. Please try again.');
        } finally {
            if (authSubmitBtn) {
                authSubmitBtn.classList.remove('loading');
                authSubmitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In';
            }
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
    
    showAuthError(message) {
        console.error('❌ Auth error:', message);
        
        // Create or update error message element
        let errorEl = document.querySelector('.auth-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'auth-error';
            errorEl.style.cssText = `
                color: #e74c3c;
                font-size: 0.9rem;
                margin-top: 0.5rem;
                text-align: center;
                background: rgba(231, 76, 60, 0.1);
                padding: 0.5rem;
                border-radius: 4px;
                border: 1px solid rgba(231, 76, 60, 0.3);
            `;
            
            const authForm = document.querySelector('.auth-form');
            if (authForm) {
                authForm.appendChild(errorEl);
            }
        }
        
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorEl) {
                errorEl.style.display = 'none';
            }
        }, 5000);
    }

    continueToApp() {
        console.log('🎯 Redirecting to main app...');
        // Smooth transition to main app
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.5s ease-out';
        setTimeout(()=>{
            window.location.href = 'chat.html';
        }, 500);
    }

    setupBackgroundVideo() {
        const video = document.getElementById('background-video');
        const videoBackground = document.querySelector('.video-background');
        
        // Check if video source exists
        const videoSources = video.querySelectorAll('source');
        let hasValidSource = false;
        
        videoSources.forEach(source => {
            if (source.src && source.src.trim() !== '') {
                hasValidSource = true;
            }
        });
        
        if (hasValidSource) {
            document.body.classList.add('has-video');
            console.log('🎥 Background video detected and enabled');
            
            // Ensure video properties are set
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            
            // Handle video events
            video.addEventListener('loadeddata', () => {
                console.log('✅ Background video loaded successfully');
            });
            
            video.addEventListener('error', () => {
                console.warn('⚠️ Background video failed to load, using gradient fallback');
                document.body.classList.remove('has-video');
            });
            
            // Attempt to play
            video.play().catch(error => {
                console.log('Video autoplay prevented by browser (normal):', error.message);
            });
        } else {
            console.log('🎨 No background video, using gradient background');
            document.body.classList.remove('has-video');
        }
    }

    async handleMagicLinkRequest(e) {
        e.preventDefault();
        
        const emailInput = document.getElementById('email-input');
        const submitBtn = document.getElementById('request-magic-link-btn');
        
        if (!emailInput || !submitBtn) return;
        
        const email = emailInput.value.trim();
        if (!email) {
            this.showError('Please enter your email address');
            return;
        }
        
        this.userEmail = email;
        
        // Show loading state
        submitBtn.classList.add('loading');
        
        try {
            console.log('📧 Requesting magic link for:', email);
            
            if (!window.authService) {
                throw new Error('Authentication service not available');
            }
            
            await window.authService.requestMagicLink(email);
            console.log('✅ Magic link sent successfully');
            
            // Show waiting step
            this.showStep('waiting');
            
        } catch (error) {
            console.error('❌ Magic link request failed:', error);
            this.showError(error.message || 'Failed to send magic link. Please try again.');
        } finally {
            submitBtn.classList.remove('loading');
        }
    }

    async verifyMagicLinkToken(token) {
        console.log('🔗 Verifying magic link token...');
        this.showStep('verifying');
        
        try {
            if (!window.authService) {
                throw new Error('Authentication service not available');
            }
            
            // Call the backend API to verify the token
            const response = await fetch(window.API.endpoints.verifyMagicLink, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Token verification failed');
            }
            
            const data = await response.json();
            console.log('✅ Magic link verified successfully:', data);
            
            // Store the session token
            if (data.sessionToken) {
                window.authService.setSessionToken(data.sessionToken);
            }
            
            // Clean up URL (remove token parameter)
            const url = new URL(window.location);
            url.searchParams.delete('token');
            window.history.replaceState({}, document.title, url.toString());
            
            // Show success step
            this.showStep('success');
            
        } catch (error) {
            console.error('❌ Magic link verification failed:', error);
            this.showError(error.message || 'Invalid or expired magic link. Please try again.');
        }
    }

    async resendMagicLink() {
        if (!this.userEmail) {
            this.showStep('login');
            return;
        }
        
        const resendBtn = document.getElementById('resend-magic-link-btn');
        if (resendBtn) {
            resendBtn.classList.add('loading');
            resendBtn.textContent = 'Sending...';
        }
        
        try {
            await window.authService.requestMagicLink(this.userEmail);
            console.log('✅ Magic link resent successfully');
            
            // Show brief confirmation
            if (resendBtn) {
                resendBtn.textContent = 'Sent!';
                setTimeout(() => {
                    resendBtn.textContent = 'Resend Magic Link';
                    resendBtn.classList.remove('loading');
                }, 2000);
            }
            
        } catch (error) {
            console.error('❌ Resend magic link failed:', error);
            this.showError(error.message || 'Failed to resend magic link');
            
            if (resendBtn) {
                resendBtn.textContent = 'Resend Magic Link';
                resendBtn.classList.remove('loading');
            }
        }
    }

    async handleMagicLinkVerification() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if (!token) return;
        
        console.log('🔑 Magic link token detected, verifying...');
        
        try {
            if (!window.authService) {
                throw new Error('Authentication service not available');
            }
            
            await window.authService.verifyMagicLink(token);
            console.log('✅ Magic link verification successful');
            
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show success step
            this.showStep('success');
            
        } catch (error) {
            console.error('❌ Magic link verification failed:', error);
            this.showError(error.message || 'Invalid or expired magic link');
        }
    }

    continueToApp() {
        console.log('🚀 Continuing to main app...');
        
        // Redirect to main app
        window.location.href = 'chat.html';
    }

    showStep(stepName) {
        console.log(`📋 Showing step: ${stepName}`);
        
        // Hide all steps
        const allSteps = document.querySelectorAll('.auth-step');
        allSteps.forEach(step => {
            step.classList.remove('active');
        });
        
        // Show target step
        const targetStep = document.getElementById(`step-${stepName}`);
        if (targetStep) {
            targetStep.classList.add('active');
            this.currentStep = stepName;
        }
        
        // Focus appropriate input
        if (stepName === 'login') {
            setTimeout(() => {
                const emailInput = document.getElementById('email-input');
                if (emailInput) emailInput.focus();
            }, 300);
        }
    }

    showError(message) {
        console.error('❌ Showing error:', message);
        
        const errorMessageEl = document.getElementById('error-message');
        if (errorMessageEl) {
            errorMessageEl.textContent = message;
        }
        
        this.showStep('error');
    }
}

// Initialize splash page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 DOM loaded, initializing splash page...');
    window.splashPage = new SplashPage();
});

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
