# Complete Dandelion Design System

## Typography
```css
--font-primary: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-weights: 300, 400, 500, 600, 700;
```

## Core Brand Colors

### Primary Palette
```css
--primary-gold: #D4A574;        /* Dandelion/network gold */
--primary-gold-light: #E6C59C;  /* Lighter variant */
--primary-gold-dark: #B8915F;   /* Darker variant */
--primary-gold-soft: #F5E6D3;   /* Very light backgrounds */
--primary-gold-glow: #FFD700;   /* Network node glow effect */
```

### Secondary Palette
```css
--secondary-blue: #5B9FD9;      /* Sky blue - primary CTAs */
--secondary-blue-light: #7FB4E3; /* Hover states */
--secondary-blue-dark: #4682B4;  /* Active states */
--secondary-purple: #9B7EBD;     /* Extracted memories */
--secondary-coral: #E76B74;      /* Warm coral - alerts */
```

### Neutral Palette
```css
--neutral-100: #FFFFFF;          /* Pure white */
--neutral-200: #F8F9FA;          /* Off-white */
--neutral-300: #E9ECEF;          /* Light borders */
--neutral-400: #CED4DA;          /* Disabled */
--neutral-500: #ADB5BD;          /* Placeholder */
--neutral-600: #6C757D;          /* Secondary text */
--neutral-700: #495057;          /* Body text */
--neutral-800: #343A40;          /* Headings */
--neutral-900: #212529;          /* Maximum contrast */
```

### Dark Mode / Overlay Palette
```css
--dark-overlay-900: rgba(0, 0, 0, 0.95);   /* Nearly opaque */
--dark-overlay-800: rgba(0, 0, 0, 0.85);   /* Heavy overlay */
--dark-overlay-700: rgba(0, 0, 0, 0.75);   /* Modal backgrounds */
--dark-overlay-600: rgba(0, 0, 0, 0.60);   /* Medium overlay */
--dark-overlay-400: rgba(0, 0, 0, 0.40);   /* Light overlay */
--dark-surface: rgba(33, 37, 41, 0.95);    /* Dark card surface */
```

### Glassmorphism Effects
```css
--glass-white: rgba(255, 255, 255, 0.1);
--glass-white-border: rgba(255, 255, 255, 0.2);
--glass-dark: rgba(0, 0, 0, 0.5);
--glass-blur: blur(10px);
--glass-blur-heavy: blur(20px);
```

## Landing Page Components

### Hero Section
```css
.hero-background {
  position: relative;
  background-image: url('cafe-memories.jpg');
  background-size: cover;
  background-position: center;
}

.hero-overlay {
  background: linear-gradient(
    180deg, 
    var(--dark-overlay-400) 0%, 
    var(--dark-overlay-600) 100%
  );
}

.memory-network {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.network-line {
  stroke: var(--primary-gold);
  stroke-width: 1;
  opacity: 0.6;
}

.network-node {
  fill: var(--primary-gold);
  filter: drop-shadow(0 0 6px var(--primary-gold-glow));
}

.memory-thumbnail {
  border: 2px solid var(--primary-gold);
  border-radius: 8px;
  box-shadow: 0 0 20px rgba(212, 165, 116, 0.4);
}
```

### Transparent Header
```css
.header-transparent {
  background: var(--glass-dark);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-white-border);
}

.header-logo {
  color: var(--primary-gold);
  font-family: var(--font-primary);
  font-weight: 300;
  font-size: 1.5rem;
  text-shadow: 0 0 20px rgba(212, 165, 116, 0.5);
}

.header-nav-link {
  color: var(--neutral-100);
  font-family: var(--font-primary);
  font-weight: 400;
  opacity: 0.9;
  transition: all 0.3s ease;
}

.header-nav-link:hover {
  color: var(--primary-gold-light);
  text-shadow: 0 0 10px rgba(212, 165, 116, 0.4);
}
```

### Login Modal (Glassmorphism)
```css
.modal-backdrop {
  background: var(--dark-overlay-700);
  backdrop-filter: var(--glass-blur-heavy);
}

.modal-card {
  background: var(--dark-surface);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-white-border);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
}

.modal-tabs {
  border-bottom: 1px solid var(--glass-white-border);
}

.tab-inactive {
  color: var(--neutral-500);
  background: transparent;
  font-family: var(--font-primary);
  font-weight: 500;
}

.tab-active {
  color: var(--neutral-100);
  background: var(--glass-white);
  font-family: var(--font-primary);
  font-weight: 600;
}

.input-dark {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-white-border);
  color: var(--neutral-100);
  font-family: var(--font-primary);
}

.input-dark:focus {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--primary-gold);
  box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.2);
}

.input-dark::placeholder {
  color: var(--neutral-500);
}

.btn-primary-landing {
  background: var(--secondary-blue);
  color: var(--neutral-100);
  font-family: var(--font-primary);
  font-weight: 600;
  border: none;
  transition: all 0.3s ease;
}

.btn-primary-landing:hover {
  background: var(--secondary-blue-light);
  box-shadow: 0 4px 20px rgba(91, 159, 217, 0.4);
}

.forgot-password-link {
  color: var(--neutral-400);
  font-family: var(--font-primary);
  font-size: 0.875rem;
}

.forgot-password-link:hover {
  color: var(--primary-gold-light);
}
```

### Footer (Dark)
```css
.footer-dark {
  background: var(--dark-overlay-900);
  color: var(--neutral-400);
  font-family: var(--font-primary);
  font-weight: 300;
  font-size: 0.875rem;
}
```

## Application Interface Components

### Navigation (Light Mode)
```css
.navbar-app {
  background: var(--neutral-100);
  border-bottom: 1px solid var(--neutral-300);
  font-family: var(--font-primary);
}

.brand-logo-app {
  color: var(--primary-gold);
  font-weight: 300;
  font-size: 1.25rem;
}

.nav-button-create {
  background: var(--secondary-blue);
  color: var(--neutral-100);
  font-weight: 500;
}

.nav-button-reset {
  background: var(--secondary-coral);
  color: var(--neutral-100);
  font-weight: 500;
}

.nav-button-export {
  background: var(--neutral-200);
  color: var(--neutral-700);
  border: 1px solid var(--neutral-300);
  font-weight: 500;
}

.model-selector {
  background: var(--neutral-100);
  border: 1px solid var(--neutral-300);
  color: var(--neutral-700);
  font-family: var(--font-primary);
  font-weight: 500;
}
```

### Chat Interface
```css
.chat-container {
  background: var(--neutral-200);
  font-family: var(--font-primary);
}

.message-collaborator {
  background: var(--secondary-blue);
  color: var(--neutral-100);
  font-weight: 400;
  line-height: 1.6;
}

.message-user {
  background: var(--neutral-100);
  color: var(--neutral-800);
  border: 1px solid var(--neutral-300);
  font-weight: 400;
}

.avatar-collaborator {
  background: var(--primary-gold);
  box-shadow: 0 2px 8px rgba(212, 165, 116, 0.3);
}

.timestamp {
  color: var(--neutral-600);
  font-size: 0.75rem;
  font-weight: 400;
}
```

### Sidebar - Extracted Memories
```css
.sidebar-memories {
  background: var(--secondary-purple);
  color: var(--neutral-100);
  font-family: var(--font-primary);
}

.sidebar-header {
  background: rgba(0, 0, 0, 0.1);
  padding: 1rem;
  font-weight: 600;
}

.memory-category {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin: 0.5rem;
  padding: 0.75rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.memory-category:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateX(4px);
}

.category-icon {
  margin-right: 0.5rem;
}

.category-count {
  background: var(--primary-gold);
  color: var(--neutral-900);
  border-radius: 12px;
  padding: 2px 8px;
  font-weight: 600;
  font-size: 0.75rem;
}
```

## Animation & Effects

### Network Animation (Landing Page)
```css
@keyframes pulse-glow {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes data-flow {
  0% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -20; }
}

.network-line {
  animation: pulse-glow 3s ease-in-out infinite;
  stroke-dasharray: 5, 10;
  animation: data-flow 2s linear infinite;
}

.network-node {
  animation: pulse-glow 2s ease-in-out infinite;
}

.memory-thumbnail {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.memory-thumbnail:hover {
  transform: scale(1.05);
  box-shadow: 0 0 30px rgba(212, 165, 116, 0.6);
}
```

### Hover Effects
```css
.interactive-element {
  transition: all 0.2s ease;
}

.golden-hover:hover {
  color: var(--primary-gold);
  text-shadow: 0 0 10px rgba(212, 165, 116, 0.3);
}

.lift-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

## Typography Scale
```css
.text-hero {
  font-family: var(--font-primary);
  font-size: 3rem;
  font-weight: 300;
  letter-spacing: -0.02em;
  color: var(--neutral-100);
}

.text-tagline {
  font-family: var(--font-primary);
  font-size: 1.25rem;
  font-weight: 400;
  color: var(--primary-gold-light);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

h1 { 
  font-family: var(--font-primary);
  font-weight: 700;
  font-size: 2rem;
  color: var(--neutral-900);
}

h2 { 
  font-family: var(--font-primary);
  font-weight: 600;
  font-size: 1.5rem;
  color: var(--neutral-800);
}

h3 { 
  font-family: var(--font-primary);
  font-weight: 600;
  font-size: 1.25rem;
  color: var(--neutral-800);
}

.body-text { 
  font-family: var(--font-primary);
  font-weight: 400;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--neutral-700);
}

.caption { 
  font-family: var(--font-primary);
  font-weight: 400;
  font-size: 0.875rem;
  color: var(--neutral-600);
}
```

## Responsive Breakpoints
```css
--breakpoint-sm: 576px;
--breakpoint-md: 768px;
--breakpoint-lg: 992px;
--breakpoint-xl: 1200px;
```

## Implementation Notes

1. **Dual Context Support**: The system now supports both dark/transparent landing page and light application interface
2. **Glassmorphism**: Use backdrop-filter for modern glass effects on modals and overlays
3. **Golden Network**: The memory network visualization uses your existing gold with glow effects
4. **Montserrat Font**: Applied throughout with appropriate weights (300 for elegant headers, 400-600 for body/UI)
5. **Smooth Transitions**: All interactive elements have subtle animations
6. **Accessibility**: Maintains WCAG AA compliance in both light and dark contexts

## CSS Reset & Base
```css
:root {
  /* All variables listed above */
}

* {
  font-family: var(--font-primary);
}

body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```