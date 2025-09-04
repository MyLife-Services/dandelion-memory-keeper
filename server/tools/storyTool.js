const storyInteraction = require('./storyInteraction');

/**
 * Story tool for the Collaborator agent
 * Allows searching, retrieving, and updating user stories
 */
module.exports = {
    name: 'story_manager',
    description: 'Search, retrieve, and manage user stories about life events',
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['search', 'retrieve', 'append', 'create'],
                description: 'The action to perform'
            },
            userId: {
                type: 'string',
                description: 'The user ID'
            },
            query: {
                type: 'string',
                description: 'Search query or user message (for search action)'
            },
            storyId: {
                type: 'string',
                description: 'Story ID (for retrieve or append actions)'
            },
            newContent: {
                type: 'string',
                description: 'New content to add (for append or create actions)'
            },
            title: {
                type: 'string',
                description: 'Story title (for create action)'
            },
            entities: {
                type: 'object',
                description: 'Extracted entities (for create action)',
                properties: {
                    people: { type: 'array', items: { type: 'string' } },
                    places: { type: 'array', items: { type: 'string' } },
                    dates: { type: 'array', items: { type: 'string' } },
                    events: { type: 'array', items: { type: 'string' } }
                }
            }
        },
        required: ['action', 'userId']
    },

    /**
     * Execute the story tool
     */
    run: async (input) => {
        const { action, userId, query, storyId, newContent, title, entities } = input;

        switch (action) {
            case 'search':
                // Search for stories based on user's message
                if (!query) {
                    throw new Error('Query is required for search action');
                }
                return await storyInteraction.searchUserStories(userId, query);

            case 'retrieve':
                // Get full story for retelling
                if (!storyId) {
                    throw new Error('Story ID is required for retrieve action');
                }
                return await storyInteraction.getStoryForRetelling(storyId, userId);

            case 'append':
                // Add new information to existing story
                if (!storyId || !newContent) {
                    throw new Error('Story ID and new content are required for append action');
                }
                return await storyInteraction.appendToStory(storyId, userId, newContent);

            case 'create':
                // Create a new story from conversation
                if (!title || !newContent) {
                    throw new Error('Title and content are required for create action');
                }
                return await storyInteraction.createStoryFromConversation(
                    userId, 
                    title, 
                    newContent, 
                    entities || {}
                );

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
};

/**
 * Example usage in Collaborator agent:
 * 
 * User: "Tell me about when I moved to New York"
 * 
 * 1. Agent calls story_manager with action: 'search', query: 'moved to New York'
 * 2. Tool returns found stories with brief summaries
 * 3. Agent presents options to user
 * 
 * User: "Yes, tell me the whole story"
 * 
 * 4. Agent calls story_manager with action: 'retrieve', storyId: <id>
 * 5. Tool returns full narrative
 * 6. Agent shares the story with user
 * 
 * User: "Actually, I forgot to mention we stayed at Ellis Island for 3 days"
 * 
 * 7. Agent calls story_manager with action: 'append', storyId: <id>, newContent: 'stayed at Ellis Island for 3 days'
 * 8. Tool updates story and confirms
 * 
 * User: "I want to tell you about my father's funeral"
 * 
 * 9. Agent listens to story, extracts entities via memory_extractor
 * 10. Agent calls story_manager with action: 'create', title: "Father's Funeral", content: <story>, entities: <extracted>
 * 11. Tool creates new story
 */