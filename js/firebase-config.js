// Firebase Configuration and Authentication
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    onIdTokenChanged,
    sendEmailVerification,
    sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

// Firebase configuration - use window.ENV which is loaded from /env.js
const firebaseConfig = {
    apiKey: window.ENV?.FIREBASE_API_KEY,
    authDomain: window.ENV?.FIREBASE_AUTH_DOMAIN,
    projectId: window.ENV?.FIREBASE_PROJECT_ID,
    storageBucket: window.ENV?.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: window.ENV?.FIREBASE_MESSAGING_SENDER_ID,
    appId: window.ENV?.FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Authentication state management
let currentUser = null;
let authStateCallbacks = [];
let idTokenCallbacks = [];

// Initialize authentication state listener
onAuthStateChanged(auth, (user) => {
    try { console.log('[firebase] onAuthStateChanged user=', !!user, '@', Date.now()); } catch (_) {}
    currentUser = user;
    
    // Notify all callbacks
    authStateCallbacks.forEach(callback => {
        try {
            callback(user);
        } catch (error) {
            console.error('Auth state callback error:', error);
        }
    });
});

// Listen for ID token changes (refresh, rotation)
onIdTokenChanged(auth, (user) => {
    try { console.log('[firebase] onIdTokenChanged user=', !!user, '@', Date.now()); } catch (_) {}
    // Only notify when a user exists; sign-out handled by onAuthStateChanged
    if (!user) {
        // Still notify null to allow listeners to clean up
        idTokenCallbacks.forEach(cb => { try { cb(null); } catch (_) {} });
        return;
    }
    idTokenCallbacks.forEach(callback => {
        try {
            callback(user);
        } catch (error) {
            console.error('ID token callback error:', error);
        }
    });
});

// Authentication API
window.firebaseAuth = {
    // Get current user
    getCurrentUser() {
        return currentUser;
    },

    // Check if user is authenticated
    isAuthenticated() {
        return currentUser !== null;
    },

    // Get user token for API calls
    async getIdToken(forceRefresh = false) {
        if (!currentUser) {
            throw new Error('User not authenticated');
        }
        return await currentUser.getIdToken(forceRefresh);
    },

    // Sign up with email and password
    async signUp(email, password) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Send email verification
            await sendEmailVerification(userCredential.user);
            
            return {
                success: true,
                user: userCredential.user,
                message: 'Account created successfully! Please check your email to verify your account.'
            };
        } catch (error) {
            console.error('Sign up error:', error);
            return {
                success: false,
                error: this.getFirebaseErrorMessage(error)
            };
        }
    },

    // Sign in with email and password
    async signIn(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return {
                success: true,
                user: userCredential.user,
                message: 'Signed in successfully!'
            };
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                success: false,
                error: this.getFirebaseErrorMessage(error)
            };
        }
    },

    // Sign out
    async signOut() {
        try {
            await signOut(auth);
            return {
                success: true,
                message: 'Signed out successfully!'
            };
        } catch (error) {
            console.error('Sign out error:', error);
            return {
                success: false,
                error: 'Failed to sign out. Please try again.'
            };
        }
    },

    // Send password reset email
    async resetPassword(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            return {
                success: true,
                message: 'Password reset email sent! Please check your inbox.'
            };
        } catch (error) {
            console.error('Password reset error:', error);
            return {
                success: false,
                error: this.getFirebaseErrorMessage(error)
            };
        }
    },

    // Add auth state change listener
    onAuthStateChanged(callback) {
        authStateCallbacks.push(callback);
        
        // Call immediately with current state (including null) so pages can react on initial load
        try {
            console.log('[firebase] immediate onAuthStateChanged invoke user=', !!currentUser, '@', Date.now());
            callback(currentUser);
        } catch (e) {
            console.error('Auth state callback immediate invoke error:', e);
        }
        
        // Return unsubscribe function
        return () => {
            const index = authStateCallbacks.indexOf(callback);
            if (index > -1) {
                authStateCallbacks.splice(index, 1);
            }
        };
    },

    // Add ID token change listener (fires on token refresh)
    onIdTokenChanged(callback) {
        idTokenCallbacks.push(callback);
        // Immediately invoke with current user (may be null)
        try {
            console.log('[firebase] immediate onIdTokenChanged invoke user=', !!currentUser, '@', Date.now());
            callback(currentUser);
        } catch (e) {
            console.error('ID token callback immediate invoke error:', e);
        }
        return () => {
            const index = idTokenCallbacks.indexOf(callback);
            if (index > -1) {
                idTokenCallbacks.splice(index, 1);
            }
        };
    },

    // Get user-friendly error messages tailored for seniors
    getFirebaseErrorMessage(error) {
        const errorCode = error.code;
        
        switch (errorCode) {
            case 'auth/user-not-found':
                return 'We couldn\'t find an account with that email address. Would you like to create a new account instead?';
            case 'auth/wrong-password':
                return 'The password you entered is incorrect. Please double-check and try again, or use "Forgot password" if you need help.';
            case 'auth/email-already-in-use':
                return 'An account with this email address already exists. Please try signing in instead, or use a different email address.';
            case 'auth/weak-password':
                return 'Your password needs to be at least 6 characters long. Please choose a stronger password.';
            case 'auth/invalid-email':
                return 'Please check that you\'ve entered a valid email address (like example@email.com).';
            case 'auth/user-disabled':
                return 'Your account has been temporarily disabled. Please contact our support team for assistance.';
            case 'auth/too-many-requests':
                return 'Too many sign-in attempts. Please wait a few minutes before trying again for your security.';
            case 'auth/network-request-failed':
                return 'Having trouble connecting to the internet. Please check your connection and try again in a moment.';
            case 'auth/requires-recent-login':
                return 'For your security, please sign in again to continue with this action.';
            case 'auth/popup-blocked':
                return 'Your browser blocked the sign-in window. Please allow pop-ups for this site and try again.';
            case 'auth/popup-closed-by-user':
                return 'The sign-in window was closed. Please try again when you\'re ready.';
            case 'auth/cancelled-popup-request':
                return 'Sign-in was cancelled. Please try again when you\'re ready.';
            case 'auth/operation-not-allowed':
                return 'This sign-in method is not currently available. Please try a different way to sign in.';
            case 'auth/invalid-credential':
                return 'The sign-in information is not valid. Please check your email and password and try again.';
            case 'auth/credential-already-in-use':
                return 'This account is already linked to another user. Please try signing in with a different account.';
            case 'auth/timeout':
                return 'The connection timed out. Please check your internet connection and try again.';
            default:
                // Provide helpful fallback message
                const friendlyMessage = this.getFriendlyFallbackMessage(error);
                return friendlyMessage;
        }
    },

    // Provide helpful fallback messages for unknown errors
    getFriendlyFallbackMessage(error) {
        const message = error.message || '';
        
        // Check for common patterns in error messages
        if (message.includes('network') || message.includes('connection')) {
            return 'Having trouble connecting. Please check your internet connection and try again.';
        }
        if (message.includes('timeout')) {
            return 'The request took too long. Please try again in a moment.';
        }
        if (message.includes('permission') || message.includes('access')) {
            return 'Permission issue detected. Please refresh the page and try again.';
        }
        if (message.includes('quota') || message.includes('limit')) {
            return 'Service temporarily busy. Please try again in a few minutes.';
        }
        
        // Generic helpful message
        return 'Something went wrong, but don\'t worry! Please try again, or refresh the page if the problem continues.';
    }
};

// Signal to the rest of the app that Firebase auth is ready
try { console.log('[firebase] dispatch firebase-ready @', Date.now()); } catch (_) {}
window.dispatchEvent(new Event('firebase-ready'));
