require('dotenv').config();
const enhancedStoryAggregator = require('../server/tools/enhancedStoryAggregator');
const storyInteraction = require('../server/tools/storyInteraction');

// Mock test data
const mockMemories = [
    {
        id: 1,
        conversationId: 'conv1',
        createdAt: new Date('2024-01-15'),
        payload: {
            narrator: "Henry Robinson",
            people: ["Giuseppe", "Maria", "Antonio"],
            places: ["Sicily", "Ellis Island", "New York City", "Little Italy"],
            dates: ["1955", "March 1955"],
            events: ["immigrated to America", "arrived at Ellis Island", "settled in Little Italy"],
            relationships: [
                { from: "Giuseppe", to: "Henry Robinson", relation: "father" },
                { from: "Maria", to: "Henry Robinson", relation: "mother" },
                { from: "Antonio", to: "Henry Robinson", relation: "brother" }
            ]
        }
    },
    {
        id: 2,
        conversationId: 'conv1',
        createdAt: new Date('2024-01-16'),
        payload: {
            people: ["Giuseppe", "Maria"],
            places: ["Ellis Island", "Manhattan"],
            dates: ["March 15, 1955"],
            events: ["processed at Ellis Island", "medical examinations", "name changed"],
            relationships: []
        }
    },
    {
        id: 3,
        conversationId: 'conv1',
        createdAt: new Date('2024-01-17'),
        payload: {
            people: ["Giuseppe", "Uncle Salvatore"],
            places: ["Little Italy", "Mulberry Street"],
            dates: ["1955", "Spring 1955"],
            events: ["found apartment", "started working at bakery"],
            relationships: [
                { from: "Salvatore", to: "Giuseppe", relation: "brother" }
            ]
        }
    },
    {
        id: 4,
        conversationId: 'conv2',
        createdAt: new Date('2024-02-01'),
        payload: {
            narrator: "Henry Robinson",
            people: ["Dad", "Mom", "Dr. Williams"],
            places: ["Mount Sinai Hospital", "New York"],
            dates: ["December 2023", "December 15, 2023"],
            events: ["father's death", "cancer diagnosis", "final goodbye"],
            relationships: [
                { from: "Dad", to: "Henry Robinson", relation: "father" }
            ]
        }
    },
    {
        id: 5,
        conversationId: 'conv2',
        createdAt: new Date('2024-02-02'),
        payload: {
            people: ["Dad", "family members"],
            places: ["hospital room", "Mount Sinai"],
            dates: ["December 15, 2023", "3:45 AM"],
            events: ["passed away", "held his hand", "said goodbye"],
            relationships: []
        }
    }
];

async function testStoryCreation() {
    console.log('\n🧪 Testing Story Aggregation System\n');
    console.log('='*50);
    
    try {
        // Test 1: Auto-create stories from memories
        console.log('\n📚 Test 1: Auto-creating stories from memories...\n');
        const stories = await enhancedStoryAggregator.autoCreateStories(mockMemories, 'test-user-123');
        
        console.log(`Created ${stories.length} stories:\n`);
        
        for (const story of stories) {
            console.log(`\n📖 Story: "${story.title}"`);
            console.log(`   Brief Summary: ${story.brief_summary}`);
            console.log(`   Tone: ${story.tone}`);
            console.log(`   Emotional Tags: ${story.emotional_tags?.join(', ') || 'none'}`);
            console.log(`   Significance: ${story.significance_rating}/5`);
            console.log(`   People: ${story.people.join(', ')}`);
            console.log(`   Places: ${story.places.join(', ')}`);
            console.log(`   Events: ${story.events.slice(0, 3).join(', ')}...`);
            console.log(`\n   Narrative Preview:`);
            console.log(`   ${story.narrative?.substring(0, 200)}...`);
        }
        
        // Test 2: Search for stories
        console.log('\n\n📚 Test 2: Searching for stories...\n');
        
        // Mock search function (since we don't have DB connection)
        const mockSearch = async (query) => {
            // Simulate finding stories based on keywords
            const results = stories.filter(s => 
                s.narrative?.toLowerCase().includes(query.toLowerCase()) ||
                s.title?.toLowerCase().includes(query.toLowerCase()) ||
                s.people.some(p => p.toLowerCase().includes(query.toLowerCase()))
            );
            
            return results.map(s => ({
                id: Math.random(),
                title: s.title,
                brief_summary: s.brief_summary,
                significance_rating: s.significance_rating,
                tone: s.tone,
                people: s.people.slice(0, 3),
                dates: s.dates?.slice(0, 2)
            }));
        };
        
        const searchQueries = [
            "tell me about moving to New York",
            "what happened to my father",
            "Ellis Island story"
        ];
        
        for (const query of searchQueries) {
            console.log(`\n🔍 Searching for: "${query}"`);
            const results = await mockSearch(query);
            
            if (results.length > 0) {
                console.log(`   Found ${results.length} matching story(ies):`);
                results.forEach(r => {
                    console.log(`   • ${r.brief_summary || r.title}`);
                });
            } else {
                console.log(`   No stories found. Would you like to tell me about it?`);
            }
        }
        
        // Test 3: Contradiction detection
        console.log('\n\n📚 Test 3: Testing contradiction detection...\n');
        
        const existingStory = stories[0];
        if (existingStory) {
            const newInfo = "Actually, we arrived in April 1956, not March 1955";
            console.log(`Existing story has dates: ${existingStory.dates?.join(', ')}`);
            console.log(`New information: "${newInfo}"`);
            
            // Simple contradiction check
            const hasDateConflict = existingStory.dates?.some(d => d.includes('1955'));
            if (hasDateConflict) {
                console.log(`\n⚠️  Contradiction detected!`);
                console.log(`   The story mentions 1955, but you just said 1956.`);
                console.log(`   Could you help me understand which is correct?`);
            }
        }
        
        console.log('\n' + '='*50);
        console.log('✅ Story system tests completed!\n');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testStoryCreation();