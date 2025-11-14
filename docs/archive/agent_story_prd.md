# Product Requirements Document: Agentic AI Story Collection System

## Executive Summary

This document outlines the technical exploration and requirements for a multi-agent AI system designed to help elderly users share their life stories through conversational AI, with automated data extraction and memory assessment capabilities.

## Project Context

**Stakeholder**: Nonprofit organization focused on elder care and memory preservation  
**Use Case**: Elderly users engage in guided storytelling sessions with AI agents that can:

- Conduct empathetic interviews
- Extract structured data from conversations
- Connect to external services (photo apps, ancestry.com)
- Assess cognitive/memory patterns for healthcare providers

## Technical Architecture Exploration

### Environment Setup

**Virtual Environment Configuration**:

```bash
# Created isolated Python environment
python -m venv vibe-agents-env
source vibe-agents-env/bin/activate
pip install autogenstudio
```

**Dependency Management Lessons**:

- Global package conflicts (alpaca-py, memebot, solana-trader) caused version incompatibilities
- Virtual environments essential for multi-project AI/ML development
- AutoGen Studio requires pydantic >= 2.0.0, conflicting with legacy trading packages

### Dandelion Architecture

As of 2025-09-01, attempts will be made to both brand the tool for use by MyLife/Dandelion with beta-testing retirement communities, beginning with Masonic Villages campus in Elizabethtown, Pennsylvania.

### Agent Architecture

1. **Collaborator Agent (Conversation Facilitator)**
   - **Role**: Primary user interface for elderly storytelling
   - **System Prompt**: "You are a gentle collaborator helping elderly people share their life stories. Ask thoughtful follow-up questions about family, childhood memories, and important life events. Keep responses warm and conversational."
   - **Model**: Claude 3.5 Sonnet (Anthropic)
   - **Capabilities**
      - Empathetic conversation flow
      - Context-aware follow-up questions
      - Memory-friendly pacing

2. **Memory Keeper Agent (Information Processor)**
   - **Role**: Structured memory extraction from conversations
   - **System Prompt**: "Extract structured memories from conversations as JSON: {'people': [], 'dates': [], 'places': [], 'relationships': [], 'events': []}. Only include explicitly mentioned information."
   - **Model**: Claude 3.5 Sonnet (Anthropic)
   - **Output Format**: Structured JSON for downstream processing

3. **Context Enrichment Agent (Research Assistant)** *[Planned]*
   - **Role**: External data integration and historical context
   - **Capabilities**
     - iCloud photo integration
     - Ancestry.com data correlation
     - Historical context for mentioned events/places

4. **Memory Assessment Agent (Healthcare Integration)** *[Planned]*
   - **Role**: Cognitive pattern analysis for healthcare providers
   - **Capabilities**
     - Timeline coherence analysis
     - Detail retention assessment
     - Memory quality indicators

### Coordination Patterns

#### Round-Robin Group Chat Architecture

- **Team Orchestrator**: Central message router
- **Flow**: User → Collaborator → Memory Keeper → Team → User
- **Coordination**: AutoGen Studio's RoundRobinGroupChat handles agent sequencing
- **Termination**: Configured termination conditions to prevent infinite loops

#### Message Flow Example

> **Member**: "I grew up in Brooklyn in the 1950s with my three brothers Tommy, Frank, and Joey."\
**Collaborator**: "What wonderful memories from Brooklyn! Can you tell me more about what it was like growing up with three brothers? What was your neighborhood like in the 1950s?"

```json
Memory Keeper: {
  "people": ["Tommy", "Frank", "Joey"],
  "dates": ["1950s"],
  "places": ["Brooklyn"],
  "relationships": ["brothers"],
  "events": ["grew up"]
}
```

## UI Prototype Requirements

### UI/UX Foundation: Mosaic Project Reuse

**Source**: `/Users/henryrobinson/Documents/GitHub/mosaic`
**Approach**: Directly reuse the existing Memorial Mosaic UI/UX design, adapting content for story collection

### Deployment Strategy

- **Platform**: Render (single Express service hosting frontend and API)
- **Architecture**: Chat-based interface served by Express with SSE endpoints

### Prototype Scope

**Phase 1 Focus**: Two-agent interaction demonstration

- **Collaborator Agent**: Conversational interface for story collection
- **Memory Keeper Agent**: Real-time memory extraction and display

### UI Components (From Mosaic)

1. **Chat Container Layout**
   - Centered container with rounded corners (20px border-radius)
   - White background with gradient backdrop
   - Header, messages area, and input area structure
   - 800px max-width, 80vh height with responsive design

2. **Header Design**
   - Gradient background: `linear-gradient(135deg, #2c3e50, #34495e)`
   - Title updated to **"Story Collection"**
   - Subtitle updated to **"Sharing your life stories with AI"**
   - Agent toggle switch for showing/hiding AI agent metadata
   - Rounded action buttons for enhanced accessibility

3. **Chat Interface**
   - Messages container with scrolling functionality
   - Typing indicator with animated dots for real-time feedback
   - Input area featuring a text field and send button
   - Button containers for conversation options
   - Manual conversation advancement enabled via clickable elements

4. **Memory Display Integration**
   - **New Feature**: Side panel or expandable section for Memory Keeper output
   - Real-time structured data visualization:
     - People mentioned
     - Important dates
     - Places and locations
     - Relationships identified
     - Key events
   - Toggle visibility for Memory Keeper output, similar to existing agent metadata

### Technical Stack (Reused from Mosaic)

**Frontend**:

- **Vanilla JavaScript** (matching mosaic architecture)
- **Custom CSS** with CSS custom properties
- **Event-driven interaction model**
- **JSON-based conversation flow**

**Backend Integration**:

- Replace JSON scripts with live Anthropic Claude API calls
- Maintain same message flow patterns
- Add Memory Keeper processing pipeline

**Deployment**:

- Deploy via Render using `render.yaml` or dashboard
- Environment variables configured in Render dashboard
- HTTPS enabled by default on Render

### Adapted User Experience Flow

1. User lands on familiar mosaic-style interface
2. Clicks "Start Sharing Your Story" (adapted from script selection)
3. Collaborator agent introduces itself (replacing canned script)
4. User types response in familiar chat interface
5. Memory Keeper extracts structured data (new sidebar/panel)
6. Collaborator responds with AI-generated follow-up
7. Process continues with real-time memory building
8. User can toggle agent metadata and memory extraction views
9. Export functionality for stories and extracted memories

### Design Adaptations

- **Color Scheme**: Keep mosaic's gradient blues/purples
- **Typography**: Maintain large, accessible text for elderly users
- **Interactions**: Preserve click-to-advance and typing indicators
- **Accessibility**: Already optimized in mosaic design
- **Agent Toggle**: Extend to include Memory Keeper visibility

## Technical Challenges Encountered

### AutoGen Studio Limitations

- **Demo Mode Restrictions**: Limited model selection, locked API configurations
- **API Key Management**: Default trial keys with rate limits
- **Customization Constraints**: Unable to modify model parameters or add custom tools

### Error Analysis

- **Error Pattern**: "An error occurred while processing this run"
- **Root Cause**: API connectivity issues with demo environment
- **Symptoms**: 0 tokens processed, immediate failure before agent execution

## Alternative Implementation Strategies

### Custom Python Implementation

```python
# Direct orchestration with full visibility
async def story_collection_pipeline(user_input):
    interviewer_response = await call_llm(conversation_prompt, user_input)
    extracted_data = await call_llm(extraction_prompt, interviewer_response)
    return interviewer_response, extracted_data
```

### CrewAI Framework

- More configurable than AutoGen Studio
- Better suited for production deployment
- Supports custom tool integration

### LangChain Multi-Agent

- Maximum flexibility for custom workflows
- Direct API control
- Better debugging capabilities

## Product Requirements

### Functional Requirements

1. **Core Conversation Engine**
   - [ ] Natural, empathetic conversational interface
   - [ ] Context-aware follow-up question generation
   - [ ] Adjustable conversation pacing for elderly users
   - [ ] Session continuity across multiple interactions

2. **Data Processing Pipeline**
   - [ ] Real-time extraction of people, places, dates, relationships
   - [ ] Structured data storage in accessible formats
   - [ ] Integration with external data sources (photos, ancestry)
   - [ ] Privacy-compliant data handling

3. **Healthcare Integration**
   - [ ] Memory quality assessment algorithms
   - [ ] Healthcare provider dashboard
   - [ ] Trend analysis over time
   - [ ] HIPAA-compliant data transmission

4. **External Integrations**
   - [ ] iCloud photo API integration
   - [ ] Ancestry.com data correlation
   - [ ] Family tree visualization
   - [ ] Social media memory triggers

### Non-Functional Requirements

1. **Performance**
   - Response time < 3 seconds for conversation flow
   - Support for 50+ concurrent users
   - 99.9% uptime during peak hours

2. **Security & Privacy**
   - End-to-end encryption for personal stories
   - HIPAA compliance for healthcare data
   - User consent management for data sharing
   - Secure API key management

3. **Usability**
   - Voice interface support for accessibility
   - Large text/simple UI for elderly users
   - Caregiver dashboard for family members
   - Multi-language support

## Next Steps

### Immediate Actions

1. **Environment Migration**: Move development to Windsurf/Claude for better customization
2. **API Key Setup**: Configure personal OpenAI keys for full functionality
3. **Manual Implementation**: Build simplified version with direct API calls