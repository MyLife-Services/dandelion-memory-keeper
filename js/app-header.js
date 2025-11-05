/**
 * App Header Controller
 * Handles the modern app header interactions for the chat interface
 */
class AppHeader {
    constructor() {
        this.setupEventListeners()
        console.log('🎛️ App header initialized')
    }
    setupEventListeners() {
        // Profile dropdown
        const profileDropdownBtn = document.getElementById('profile-dropdown-btn');
        if (profileDropdownBtn) {
            profileDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown('profile-dropdown');
            });
        }
        // Control buttons
        this.setupControlButtons();
        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            this.closeAllDropdowns();
        });
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }
    }
    setupControlButtons() {
        // Create Artifact button
        const createArtifactBtn = document.getElementById('create-artifact-btn');
        if (createArtifactBtn) {
            createArtifactBtn.addEventListener('click', () => {
                console.log('✨ Create Artifact clicked');
                this.showNotification('Create Artifact feature coming soon!');
            });
        }
        // Reset Chat button
        const resetChatBtn = document.getElementById('reset-chat-btn');
        if (resetChatBtn) {
            resetChatBtn.addEventListener('click', () => {
                this.handleResetChat();
            });
        }
        // Export Chat button
        const exportChatBtn = document.getElementById('export-chat-btn');
        if (exportChatBtn) {
            exportChatBtn.addEventListener('click', () => {
                this.handleExportChat();
            });
        }
    }
    toggleDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        // Close other dropdowns first
        this.closeAllDropdowns();
        // Toggle the requested dropdown
        dropdown.classList.toggle('hidden');
    }
    closeAllDropdowns() {
        const dropdowns = document.querySelectorAll('.dropdown-menu');
        dropdowns.forEach(dropdown => {
            dropdown.classList.add('hidden');
        });
    }
    handleResetChat() {
        console.log('🔄 Reset Chat clicked');
        
        if (confirm('Are you sure you want to reset the current chat session? This will clear all messages and memories.')) {
            // Trigger the main app's reset functionality
            const newStoryBtn = document.getElementById('new-story-btn');
            if (newStoryBtn) {
                newStoryBtn.click();
            } else {
                // Fallback: clear messages directly
                this.clearChatMessages();
            }
            
            this.showNotification('Chat session reset');
        }
    }
    handleExportChat() {
        console.log('📤 Export Chat clicked');
        // Trigger the main app's export functionality
        const exportBtn = document.getElementById('export-btn');
        if(exportBtn)
            exportBtn.click()
        else // Fallback: basic export
            this.exportChatBasic();
    }
    async handleLogout(){
        console.log('👋 Logout clicked');
        if(!confirm('Are you sure you want to sign out?'))
            return;
        await window.Globals.datamanager.logout();
        window.location.href = '/';
    }
    clearChatMessages() {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        // Clear memory panels
        const memoryItems = document.querySelectorAll('.memory-items');
        memoryItems.forEach(container => {
            container.innerHTML = '<div class="memory-placeholder">No data yet</div>';
        })
    }
    exportChatBasic() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) {
            this.showNotification('No chat messages to export');
            return;
        }

        const messages = chatMessages.querySelectorAll('.message');
        let exportText = 'Dandelion Chat Export\n';
        exportText += '========================\n\n';

        messages.forEach(message => {
            const isUser = message.classList.contains('user');
            const content = message.querySelector('.message-bubble')?.textContent || '';
            const sender = isUser ? 'You' : 'AI';
            
            exportText += `${sender}: ${content}\n\n`;
        });

        // Create and download file
        const blob = new Blob([exportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `memorykeeper-chat-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('Chat exported successfully');
    }
    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'app-notification';
        notification.textContent = message;

        document.body.appendChild(notification);

        // Trigger show animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            notification.classList.add('hide');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize app header when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if app header exists
    if (document.getElementById('app-header')) {
        console.log('🎛️ Initializing app header...');
        window.appHeader = new AppHeader();
    }
});
// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppHeader;
}
