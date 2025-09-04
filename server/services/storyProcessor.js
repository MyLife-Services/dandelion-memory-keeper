const enhancedStoryAggregator = require('../tools/enhancedStoryAggregator');
const storyStore = require('../storage/storyStore');
const database = require('../database');

/**
 * Background service for automatic story processing
 */
class StoryProcessor {
    constructor() {
        this.processingQueue = new Map(); // userId -> processing status
        this.processInterval = 60000; // Process every minute
        this.minMemoriesForStory = 3; // Minimum memories to create a story
    }

    /**
     * Start the background processor
     */
    start() {
        console.log('📚 Story Processor: Starting background service');
        
        // Process stories periodically
        setInterval(() => {
            this.processQueuedUsers();
        }, this.processInterval);

        // Also process on demand when memories are saved
        this.setupMemoryHooks();
    }

    /**
     * Queue a user for story processing
     */
    queueUserForProcessing(userId, conversationId = null) {
        if (!this.processingQueue.has(userId)) {
            this.processingQueue.set(userId, {
                conversationIds: new Set(),
                lastProcessed: null,
                status: 'pending'
            });
        }

        const userQueue = this.processingQueue.get(userId);
        if (conversationId) {
            userQueue.conversationIds.add(conversationId);
        }
        userQueue.status = 'pending';
    }

    /**
     * Process all queued users
     */
    async processQueuedUsers() {
        for (const [userId, queueInfo] of this.processingQueue.entries()) {
            if (queueInfo.status === 'pending') {
                await this.processUserStories(userId, queueInfo);
            }
        }
    }

    /**
     * Process stories for a specific user
     */
    async processUserStories(userId, queueInfo) {
        try {
            console.log(`📚 Processing stories for user ${userId}`);
            queueInfo.status = 'processing';

            // Get unprocessed memories for this user
            const memories = await this.getUnprocessedMemories(userId, queueInfo.conversationIds);
            
            if (memories.length < this.minMemoriesForStory) {
                console.log(`📚 Not enough memories to process (${memories.length} < ${this.minMemoriesForStory})`);
                queueInfo.status = 'waiting';
                return;
            }

            // Auto-create stories from memories
            const stories = await enhancedStoryAggregator.autoCreateStories(memories, userId);
            
            // Save each story
            let savedCount = 0;
            for (const story of stories) {
                try {
                    await storyStore.saveStory(story);
                    savedCount++;
                    console.log(`📚 Created story: "${story.title}" for user ${userId}`);
                } catch (error) {
                    console.error('Error saving story:', error);
                }
            }

            // Mark memories as processed
            await this.markMemoriesAsProcessed(memories.map(m => m.id));

            console.log(`📚 Created ${savedCount} stories from ${memories.length} memories for user ${userId}`);
            
            queueInfo.status = 'completed';
            queueInfo.lastProcessed = new Date();
            queueInfo.conversationIds.clear();

        } catch (error) {
            console.error(`Error processing stories for user ${userId}:`, error);
            queueInfo.status = 'error';
        }
    }

    /**
     * Get unprocessed memories for a user
     */
    async getUnprocessedMemories(userId, conversationIds = new Set()) {
        try {
            // Query for memories that haven't been processed into stories yet
            let query = `
                SELECT 
                    em.id,
                    em.conversation_id as "conversationId",
                    em.encrypted_payload,
                    em.created_at as "createdAt",
                    c.user_id
                FROM encrypted_memories em
                JOIN conversations c ON em.conversation_id = c.id
                WHERE c.user_id = $1
                AND NOT EXISTS (
                    SELECT 1 FROM stories s
                    WHERE em.id = ANY(s.source_memory_ids)
                )
            `;
            
            const params = [userId];
            
            // If specific conversations are queued, filter by them
            if (conversationIds.size > 0) {
                query += ` AND em.conversation_id = ANY($2)`;
                params.push(Array.from(conversationIds));
            }
            
            query += ` ORDER BY em.created_at DESC LIMIT 100`; // Process up to 100 memories at a time

            const result = await database.pool.query(query, params);
            
            // Decrypt and parse payloads
            return result.rows.map(row => {
                let payload = {};
                try {
                    const decrypted = database.decrypt(row.encrypted_payload);
                    payload = JSON.parse(decrypted);
                } catch (error) {
                    console.error('Error decrypting memory:', error);
                }
                
                return {
                    id: row.id,
                    conversationId: row.conversationId,
                    createdAt: row.createdAt,
                    payload
                };
            });

        } catch (error) {
            console.error('Error getting unprocessed memories:', error);
            return [];
        }
    }

    /**
     * Mark memories as processed (included in stories)
     */
    async markMemoriesAsProcessed(memoryIds) {
        // This is implicitly done by having them in source_memory_ids
        // No additional marking needed
        console.log(`📚 Marked ${memoryIds.length} memories as processed`);
    }

    /**
     * Setup hooks to process when new memories are saved
     */
    setupMemoryHooks() {
        // This would integrate with your memory saving system
        // For now, we'll expose a method that can be called after saving memories
        console.log('📚 Story Processor: Memory hooks configured');
    }

    /**
     * Manually trigger processing for a user (called after memory extraction)
     */
    async onMemorySaved(userId, conversationId, memoryData) {
        console.log(`📚 New memory saved for user ${userId}, queuing for story processing`);
        this.queueUserForProcessing(userId, conversationId);
        
        // If enough memories accumulated, process immediately
        const memories = await this.getUnprocessedMemories(userId, new Set([conversationId]));
        if (memories.length >= this.minMemoriesForStory) {
            console.log(`📚 Triggering immediate story processing for user ${userId}`);
            await this.processUserStories(userId, this.processingQueue.get(userId));
        }
    }

    /**
     * Get processing status for a user
     */
    getStatus(userId) {
        return this.processingQueue.get(userId) || { status: 'idle' };
    }

    /**
     * Get stats about story processing
     */
    async getStats() {
        try {
            const result = await database.pool.query(`
                SELECT 
                    COUNT(DISTINCT user_id) as total_users,
                    COUNT(*) as total_stories,
                    AVG(array_length(source_memory_ids, 1)) as avg_memories_per_story,
                    MAX(created_at) as last_story_created
                FROM stories
                WHERE created_at > NOW() - INTERVAL '24 hours'
            `);

            return {
                ...result.rows[0],
                queueSize: this.processingQueue.size,
                queueStatus: Array.from(this.processingQueue.entries()).map(([userId, info]) => ({
                    userId,
                    status: info.status,
                    lastProcessed: info.lastProcessed
                }))
            };
        } catch (error) {
            console.error('Error getting story processor stats:', error);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new StoryProcessor();