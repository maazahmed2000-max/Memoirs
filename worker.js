/**
 * Cloudflare Worker for Grandma Memories App
 * 
 * This worker handles:
 * 1. Saving transcribed text to a D1 SQLite database
 * 2. Conversational AI for natural conversations and follow-up questions
 * 3. Storing complete conversation history
 * 
 * Database Schema:
 * - grandma_memories: id, text, language, timestamp, person_id
 * - conversations: id, user_message, ai_response, language, timestamp, session_id, context, person_id
 * - people: id, name, created_at (optional table for managing people)
 */

/**
 * Main worker entry point
 * Handles all incoming requests
 * 
 * @param {Request} request - The incoming HTTP request
 * @param {Object} env - Environment variables (includes D1 database binding)
 * @param {Object} ctx - Execution context
 * @returns {Promise<Response>} HTTP response
 */
export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight requests (OPTIONS)
        if (request.method === 'OPTIONS') {
            return handleCORS();
        }

        // Parse the request URL
        const url = new URL(request.url);
        const path = url.pathname;

        // Route to appropriate handler
        if (path === '/save' && request.method === 'POST') {
            return handleSave(request, env);
        }

        // Conversational AI endpoint for natural conversations
        if (path === '/chat' && request.method === 'POST') {
            return handleChat(request, env);
        }

        // Get conversation history
        if (path === '/conversations' && request.method === 'GET') {
            return handleGetConversations(request, env);
        }

        // Get all people/profiles
        if (path === '/people' && request.method === 'GET') {
            return handleGetPeople(request, env);
        }

        // Handle unknown routes
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: 'Endpoint not found. Use POST /save to save data.' 
            }),
            {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            }
        );
    }
};

/**
 * Handles the POST /save endpoint
 * Saves transcribed text and language to the D1 database
 * 
 * @param {Request} request - The incoming POST request
 * @param {Object} env - Environment variables (must include DB binding)
 * @returns {Promise<Response>} Success or error response
 */
async function handleSave(request, env) {
    try {
        // Check if database binding exists
        if (!env.DB) {
            console.error('Database binding not found');
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Database not configured' 
                }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        }

        // Parse request body
        let body;
        try {
            body = await request.json();
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Invalid JSON in request body' 
                }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        }

        // Validate required fields
        if (!body.text || typeof body.text !== 'string') {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Missing or invalid "text" field' 
                }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        }

        if (!body.language || typeof body.language !== 'string') {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Missing or invalid "language" field' 
                }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        }

        // Get current timestamp in ISO 8601 format
        const timestamp = new Date().toISOString();

        // Prepare the text and language for insertion
        // Trim whitespace and limit length to prevent abuse
        const text = body.text.trim().substring(0, 10000); // Max 10,000 characters
        const language = body.language.trim().substring(0, 50); // Max 50 characters for language code
        const personId = body.personId || 'default'; // Get person_id from request, default to 'default'

        // Insert into D1 database
        // The database table should be named 'grandma_memories' with columns:
        // - id (INTEGER PRIMARY KEY AUTOINCREMENT)
        // - text (TEXT)
        // - language (TEXT)
        // - timestamp (TEXT)
        // - person_id (TEXT)
        try {
            // Create table with person_id if it doesn't exist
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS grandma_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT,
                    language TEXT,
                    timestamp TEXT,
                    person_id TEXT
                )
            `).run();

            const result = await env.DB.prepare(
                `INSERT INTO grandma_memories (text, language, timestamp, person_id) 
                 VALUES (?, ?, ?, ?)`
            )
            .bind(text, language, timestamp, personId)
            .run();

            // Check if insertion was successful
            if (result.success) {
                return new Response(
                    JSON.stringify({ 
                        success: true,
                        id: result.meta.last_row_id // Return the ID of the inserted row
                    }),
                    {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            ...getCORSHeaders()
                        }
                    }
                );
            } else {
                throw new Error('Database insertion failed');
            }
        } catch (dbError) {
            console.error('Database error:', dbError);
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Failed to save to database',
                    details: dbError.message 
                }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        }
    } catch (error) {
        // Catch any unexpected errors
        console.error('Unexpected error in handleSave:', error);
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: 'Internal server error' 
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            }
        );
    }
}

/**
 * Handles CORS preflight requests (OPTIONS)
 * Required for cross-origin requests from GitHub Pages
 * 
 * @returns {Response} CORS preflight response
 */
function handleCORS() {
    return new Response(null, {
        status: 204,
        headers: getCORSHeaders()
    });
}

/**
 * Handles the POST /chat endpoint
 * Provides conversational AI for natural conversations with follow-up questions
 * Uses free Hugging Face Inference API
 * 
 * @param {Request} request - The incoming POST request with user message
 * @param {Object} env - Environment variables
 * @returns {Promise<Response>} AI response
 */
async function handleChat(request, env) {
    try {
        // Parse request body
        let body;
        try {
            body = await request.json();
        } catch (error) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid JSON' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        const { message, language = 'en-US', sessionId, conversationHistory = [], personId } = body;

        if (!message || typeof message !== 'string') {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing message' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Build conversation context for the AI - Make it more curious and conversational
        const systemPrompt = language === 'ur-PK' 
            ? `آپ ایک انتہائی متجسس، توجہ دینے والے سننے والے AI ہیں جو کسی شخص کی زندگی، کہانیاں، اور تجربات کے بارے میں گہری دلچسپی رکھتے ہیں۔ آپ کا مقصد صرف سننا نہیں بلکہ تفصیلات حاصل کرنا ہے۔ ہمیشہ سیاق و سباق کے مطابق سوالات پوچھیں، مزید تفصیلات طلب کریں، اور ان کی کہانیوں میں دلچسپی دکھائیں۔ "میں سن رہا ہوں" جیسے عام جوابات سے گریز کریں - بجائے اس کے، مخصوص، متجسس سوالات پوچھیں جو بات چیت کو آگے بڑھائیں۔`
            : `You are an extremely curious, attentive listener AI deeply interested in learning about a person's life, stories, and experiences. Your goal is not just to listen but to actively seek details. Always ask contextual follow-up questions, request more specifics, and show genuine interest in their stories. Avoid generic responses like "I'm listening" or "yes" - instead, ask specific, curious questions that move the conversation forward. Be conversational, ask about feelings, details, people, places, and times. Show you're truly engaged by referencing what they've told you and building on it.`;

        // Build conversation history for context
        let conversationContext = systemPrompt + '\n\n';
        
        // Add recent conversation history (last 10 messages for context)
        const recentHistory = conversationHistory.slice(-10);
        for (const msg of recentHistory) {
            conversationContext += `Human: ${msg.user}\nAI: ${msg.ai}\n\n`;
        }
        
        conversationContext += `Human: ${message}\nAI:`;

        // Use Hugging Face Inference API (FREE, no API key needed for basic models)
        // Using a conversational model that works well
        const modelName = 'microsoft/DialoGPT-medium'; // Free, no auth required
        
        try {
            const response = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: {
                        past_user_inputs: recentHistory.map(m => m.user).slice(-5),
                        generated_responses: recentHistory.map(m => m.ai).slice(-5),
                        text: message
                    }
                })
            });

            let aiResponse = '';
            
            if (response.ok) {
                const result = await response.json();
                let rawResponse = result.generated_text || result[0]?.generated_text || '';
                
                // Post-process to ensure quality responses
                aiResponse = enhanceAIResponse(rawResponse, message, language, conversationHistory);
            } else {
                // Fallback: Use a contextual response generator if API fails
                aiResponse = generateFallbackResponse(message, language, conversationHistory);
            }

            // Save conversation to database
            const timestamp = new Date().toISOString();
            const session = sessionId || `session_${Date.now()}`;
            
            if (env.DB) {
                try {
                    // Create conversations table if it doesn't exist
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS conversations (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            session_id TEXT,
                            user_message TEXT,
                            ai_response TEXT,
                            language TEXT,
                            timestamp TEXT,
                            context TEXT,
                            person_id TEXT
                        )
                    `).run();

                    // Save this conversation with person_id
                    await env.DB.prepare(`
                        INSERT INTO conversations (session_id, user_message, ai_response, language, timestamp, context, person_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).bind(session, message, aiResponse, language, timestamp, JSON.stringify(conversationHistory), personId || 'default').run();
                } catch (dbError) {
                    console.error('Error saving conversation:', dbError);
                    // Continue even if DB save fails
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    response: aiResponse,
                    sessionId: session,
                    timestamp
                }),
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        } catch (apiError) {
            console.error('AI API error:', apiError);
            // Fallback response
            const fallbackResponse = generateFallbackResponse(message, language, conversationHistory);
            
            return new Response(
                JSON.stringify({
                    success: true,
                    response: fallbackResponse,
                    sessionId: sessionId || `session_${Date.now()}`,
                    timestamp: new Date().toISOString()
                }),
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        ...getCORSHeaders()
                    }
                }
            );
        }
    } catch (error) {
        console.error('Unexpected error in handleChat:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Enhances AI response to be more conversational and avoid generic responses
 */
function enhanceAIResponse(rawResponse, userMessage, language, history) {
    if (!rawResponse || rawResponse.trim().length < 5) {
        // If response is too short, generate a contextual question
        return generateContextualQuestion(userMessage, language, history);
    }
    
    const response = rawResponse.trim();
    const lowerResponse = response.toLowerCase();
    
    // Filter out generic acknowledgments
    const genericPatterns = language === 'ur-PK' 
        ? ['میں سن رہا ہوں', 'ہاں', 'ٹھیک ہے', 'جی ہاں']
        : ['i\'m listening', 'yes', 'okay', 'i see', 'i understand', 'got it', 'sure'];
    
    // If response is too generic, replace with contextual question
    if (genericPatterns.some(pattern => lowerResponse.includes(pattern) && response.length < 30)) {
        return generateContextualQuestion(userMessage, language, history);
    }
    
    // If response doesn't end with a question, try to make it more engaging
    if (!response.includes('?') && response.length < 100) {
        return response + (language === 'ur-PK' ? ' کیا آپ اس کے بارے میں مزید بتا سکتے ہیں؟' : ' Can you tell me more about that?');
    }
    
    return response;
}

/**
 * Generates contextual follow-up questions based on user message
 */
function generateContextualQuestion(message, language, history) {
    const msg = message.toLowerCase();
    const recentTopics = history.slice(-3).map(h => h.user.toLowerCase()).join(' ');
    
    if (language === 'ur-PK') {
        // Urdu contextual questions
        if (msg.includes('بچپن') || msg.includes('بچپن میں') || recentTopics.includes('بچپن')) {
            return 'آپ کے بچپن کی کون سی یاد آپ کے لیے سب سے قیمتی ہے؟ وہ کیا تھی؟';
        }
        if (msg.includes('خاندان') || msg.includes('والدین') || recentTopics.includes('خاندان')) {
            return 'آپ کے خاندان کے بارے میں مزید بتائیں۔ آپ کے والدین کیا کرتے تھے؟';
        }
        if (msg.includes('شادی') || msg.includes('بیوی') || msg.includes('شوہر')) {
            return 'آپ کی شادی کیسے ہوئی؟ آپ اپنے ساتھی سے کیسے ملے؟';
        }
        if (msg.includes('کام') || msg.includes('ملازمت') || recentTopics.includes('کام')) {
            return 'آپ نے یہ کام کیوں شروع کیا؟ اس میں آپ کا پسندیدہ حصہ کیا تھا؟';
        }
        if (msg.includes('سفر') || msg.includes('سفری') || recentTopics.includes('سفر')) {
            return 'آپ نے کہاں سفر کیا؟ وہاں کیا دیکھا؟';
        }
        return 'یہ بہت دلچسپ ہے! کیا آپ اس وقت کے بارے میں مزید بتا سکتے ہیں؟ آپ کیسا محسوس کر رہے تھے؟';
    } else {
        // English contextual questions
        if (msg.includes('childhood') || msg.includes('grew up') || recentTopics.includes('childhood')) {
            return 'What\'s your most cherished childhood memory? What made it special?';
        }
        if (msg.includes('family') || msg.includes('parents') || msg.includes('siblings') || recentTopics.includes('family')) {
            return 'Tell me more about your family. What did your parents do? What were they like?';
        }
        if (msg.includes('married') || msg.includes('spouse') || msg.includes('husband') || msg.includes('wife')) {
            return 'How did you meet your spouse? What was your wedding like?';
        }
        if (msg.includes('work') || msg.includes('job') || msg.includes('career') || recentTopics.includes('work')) {
            return 'What did you enjoy most about your work? What challenges did you face?';
        }
        if (msg.includes('travel') || msg.includes('visited') || msg.includes('went to') || recentTopics.includes('travel')) {
            return 'What was that place like? What did you see or experience there?';
        }
        if (msg.includes('school') || msg.includes('education') || msg.includes('learned') || recentTopics.includes('school')) {
            return 'What was school like for you? Who was your favorite teacher?';
        }
        if (msg.includes('friend') || msg.includes('friendship') || recentTopics.includes('friend')) {
            return 'What made that friendship special? How did you meet?';
        }
        // Generic but engaging question
        return 'That\'s fascinating! What was that experience like for you? How did it make you feel?';
    }
}

/**
 * Generates a fallback response when AI API is unavailable
 * Uses contextual pattern matching to ask engaging questions
 */
function generateFallbackResponse(message, language, history) {
    return generateContextualQuestion(message, language, history);
}

/**
 * Handles GET /conversations endpoint
 * Retrieves conversation history
 */
async function handleGetConversations(request, env) {
    try {
        if (!env.DB) {
            return new Response(
                JSON.stringify({ success: false, error: 'Database not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');
        const personId = url.searchParams.get('personId');
        const limit = parseInt(url.searchParams.get('limit') || '100');

        let query = 'SELECT * FROM conversations';
        let params = [];
        let conditions = [];

        if (sessionId) {
            conditions.push('session_id = ?');
            params.push(sessionId);
        }

        if (personId) {
            conditions.push('person_id = ?');
            params.push(personId);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const result = await env.DB.prepare(query).bind(...params).all();

        return new Response(
            JSON.stringify({
                success: true,
                conversations: result.results || []
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            }
        );
    } catch (error) {
        console.error('Error getting conversations:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Handles GET /people endpoint
 * Returns list of all people/profiles in the database
 */
async function handleGetPeople(request, env) {
    try {
        if (!env.DB) {
            return new Response(
                JSON.stringify({ success: false, error: 'Database not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Get unique people from conversations
        const conversations = await env.DB.prepare(`
            SELECT DISTINCT person_id 
            FROM conversations 
            WHERE person_id IS NOT NULL AND person_id != ''
            ORDER BY person_id
        `).all();

        // Get unique people from memories
        const memories = await env.DB.prepare(`
            SELECT DISTINCT person_id 
            FROM grandma_memories 
            WHERE person_id IS NOT NULL AND person_id != ''
            ORDER BY person_id
        `).all();

        // Combine and deduplicate
        const peopleSet = new Set();
        (conversations.results || []).forEach(row => peopleSet.add(row.person_id));
        (memories.results || []).forEach(row => peopleSet.add(row.person_id));

        const people = Array.from(peopleSet).map(id => ({ id, name: id }));

        return new Response(
            JSON.stringify({
                success: true,
                people: people
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCORSHeaders()
                }
            }
        );
    } catch (error) {
        console.error('Error getting people:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Returns CORS headers for cross-origin requests
 * Allows requests from any origin (including GitHub Pages)
 * 
 * @returns {Object} CORS headers object
 */
function getCORSHeaders() {
    return {
        'Access-Control-Allow-Origin': '*', // Allow all origins (GitHub Pages, localhost, etc.)
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    };
}

