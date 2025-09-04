# Dandelion Site Content

This document contains all written content across the Dandelion website for easy editing and content management.

## Meta Information

### SEO & Social Media
- **Page Title**: "Dandelion - Preserve Your Life Stories with AI"
- **Meta Description**: "Dandelion - AI-powered story collection for preserving life memories"
- **Open Graph Title**: "Dandelion - AI-powered story collection"
- **Open Graph Description**: "Share your life stories with AI - Collaborator and Dandelion agents help capture and organize your memories"
- **Site Name**: "Dandelion"
- **Domain**: https://vibe-agents.onrender.com/

---

## Landing Page (index.html)

### Header & Navigation
- **Logo**: "Dandelion"
- **Navigation Links**:
  - "How it Works"
  - "Support" (mailto:henryr@humanrembranceproject.org)

### Authentication Section
- **Sign In Button**: "Sign In"
- **Sign Up Button**: "Sign Up"
- **Email Label**: "Email Address"
- **Email Placeholder**: "your@email.com"
- **Password Label**: "Password"
- **Password Placeholder**: "••••••••"
- **Confirm Password Label**: "Confirm Password"
- **Confirm Password Placeholder**: "••••••••"
- **Submit Button**: "Sign In" (changes to "Sign Up" in signup mode)
- **Forgot Password Link**: "Forgot your password?"

### Footer
- **Copyright**: "© 2025 Dandelion. Your memories, preserved with care."

### How It Works Modal
- **Title**: "How Dandelion Works"
- **Main Description**: 
  > "Dandelion is like a friendly helper who listens while you share your life stories. You talk in simple, everyday language. Our assistant gently asks questions, writes down important details for you, and keeps everything safe and organized."

- **Feature List**:
  - **Easy to start**: "Just sign in and say hello. No tech skills needed."
  - **Warm conversation**: "The helper talks with you kindly and patiently."
  - **We do the writing**: "You speak, we neatly save names, places, and dates."
  - **Your memories are yours**: "Only you can see them unless you choose to share."
  - **Come back anytime**: "Pick up where you left off whenever you like."

- **Closing Message**: 
  > "Think of it as sitting with a trusted friend who helps you remember, so your family can treasure your stories for years to come."

---

## Chat Page (chat.html)

### App Header
- **Logo**: "Dandelion"
- **Page Title**: "Dandelion - AI Chat"

### App Loader
- **Loading Title**: "Loading your memories…"
- **Loading Subtitle**: "Securing your session, fetching preferences, and preparing your stories."

### Header Controls
- **Create Artifact Button**: 
  - Icon: ✨
  - Text: "Create Artifact"
  - Mobile Text: "Create"
- **Reset Chat Button**:
  - Icon: ↻
  - Text: "Reset Chat"
  - Mobile Text: "Reset"
- **Export Chat Button**:
  - Icon: ↓
  - Text: "Export"
- **Model Dropdown**:
  - Icon: ⚙
  - Default: "Claude Sonnet 3.5"
  - Mobile: "Model"
  - Options: "Claude 3.5 Sonnet", "Claude 3.5 Haiku"
- **Logout Button**:
  - Icon: 👤
  - Text: "Logout"

### Chat Interface
- **Chat Header**: "Collaborator"
- **Chat Status**: "Ready"
- **Input Placeholder**: "Share your story..."
- **Send Button**: "Send"
- **Typing Indicator**: "Processing your story..."

### Memory Panel
- **Panel Title**: "Extracted Memories"
- **Memory Status**: "Ready"

#### Memory Sections & Placeholders
- **Narrator Section**:
  - Title: "Narrator"
  - Placeholder: "No name set yet"
- **People Section**:
  - Title: "People"
  - Placeholder: "No people mentioned yet"
- **Dates Section**:
  - Title: "Dates & Times"
  - Placeholder: "No dates mentioned yet"
- **Places Section**:
  - Title: "Places"
  - Placeholder: "No places mentioned yet"
- **Relationships Section**:
  - Title: "Relationships"
  - Placeholder: "No relationships mentioned yet"
- **Events Section**:
  - Title: "Events"
  - Placeholder: "No events mentioned yet"

### Logging Panel
- **Title**: "Agent Data Flow Log"
- **Clear Button**: "Clear Log"
- **Export Button**: "Export Log"
- **Input Column**: "Input & Requests"
- **Output Column**: "Responses & Processing"

### Interactive Elements
- **Tap Hint**: "Click anywhere to continue the conversation"

---

## Onboarding Modal (js/onboarding.js)

### Modal Header
- **Title**: "Welcome to Dandelion"

### Instructions
1. "**Say hello** and share a short memory or topic you'd like to talk about."
2. "The **Collaborator** will respond warmly and ask gentle follow-ups."
3. "**Dandelion** quietly extracts _People, Dates, Places, Relationships, Events_ into the panel on the right."
4. "You can **reset** the chat anytime or **export** your conversation from the header."

### Tip
- **Tip**: "short, specific memories work best. For example, 'Tell me about your first job' or 'What was Grandma like?'"

### Footer
- **Checkbox**: "Don't show this again"
- **Action Button**: "Got it, let's start"

---

## User Prompts & Messages (js/app.js)

### Name Setting
- **Name Prompt**: "What should I call you?"
- **Invalid Name Alert**: "Please enter a valid name."
- **Confirmation**: "Are you sure you want to set your name to '[name]'?"
- **Save Error**: "Sorry, I could not save your name. Please try again."

### Debug Interface
- **Debug Toggle**: "Hide Debug Info" / "Show Debug Info"

---

## Accessibility & ARIA Labels

### Landing Page
- **Reset Button**: aria-label="Reset Chat"
- **Export Button**: aria-label="Export Chat" 
- **Logout Button**: aria-label="Logout"
- **Create Artifact Button**: aria-label="Create Artifact"
- **Modal Close**: aria-label="Close"

### Modals
- **How It Works Modal**: 
  - role="dialog" 
  - aria-modal="true" 
  - aria-labelledby="how-it-works-title"
- **Onboarding Modal**: 
  - role="dialog" 
  - aria-modal="true" 
  - aria-labelledby="onboarding-title"

---

## Email & Contact Information

- **Support Email**: henryr@humanrembranceproject.org

---

## Branding & Tone

### Voice & Tone Guidelines
- **Warm and empathetic**: Like talking to a trusted friend
- **Patient and gentle**: No rush, take your time
- **Simple language**: No technical jargon
- **Family-focused**: Preserving memories for future generations
- **Respectful of privacy**: Your stories are safe and private
- **Encouraging**: Every memory matters

### Brand Messaging
- **Primary Promise**: Preserve life stories with AI assistance
- **Value Proposition**: Easy, warm, and organized memory preservation
- **Target Audience**: Elderly users and families wanting to preserve stories
- **Key Benefits**: No tech skills needed, gentle conversation, automatic organization

---

## Content Update Notes

When updating content:
1. **Consistency**: Maintain the warm, family-friendly tone throughout
2. **Accessibility**: Update corresponding ARIA labels when changing UI text
3. **Translation Ready**: Keep text in easily identifiable strings
4. **User Testing**: Simple language for elderly users
5. **Privacy Focus**: Always emphasize user control over their memories

---

## Planned Content Features (Future)

Based on implemented but not yet integrated features:

### Story Management
- Story search and retrieval interfaces
- Timeline and relationship visualization
- Story organization by themes and significance
- Enhanced memory validation and contradiction detection

### Export Features  
- PDF story generation
- Structured memory exports
- Family sharing capabilities
- Story collaboration tools

---

*Last Updated: August 31, 2025*
*Version: 1.0*