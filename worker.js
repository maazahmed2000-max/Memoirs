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

        // Admin endpoints - require secret key
        if (path === '/admin/data' && request.method === 'GET') {
            return handleAdminGetData(request, env);
        }

        if (path === '/admin/analyze' && request.method === 'POST') {
            return handleAdminAnalyze(request, env);
        }

        if (path === '/admin/query' && request.method === 'POST') {
            return handleAdminQuery(request, env);
        }

        // Test database connectivity (for debugging)
        if (path === '/test-db' && request.method === 'GET') {
            return handleTestDB(request, env);
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

        // Build conversation history for context - use actual conversation words
        const recentHistory = conversationHistory.slice(-7);
        
        // Build rich context from actual conversation history
        let conversationContext = '';
        if (recentHistory.length > 0) {
            conversationContext = recentHistory.map(h => 
                `Human: ${h.user}\nAI: ${h.ai}`
            ).join('\n\n') + '\n\n';
        }
        
        // Enhanced system prompt that uses actual conversation context
        const systemPrompt = language === 'ur-PK' 
            ? `آپ ایک دوستانہ، متجسس انسان ہیں جو واقعی سننا چاہتا ہے۔ قدرتی طور پر بات کریں۔ اگر کوئی سوال پوچھے تو براہ راست جواب دیں۔ اگر کوئی کہانی یا واقعہ بتائے تو اس کے الفاظ استعمال کرتے ہوئے متعلقہ سوالات پوچھیں۔ گفتگو کے الفاظ اور موضوعات کو استعمال کریں۔`
            : `You are a friendly, curious person who genuinely wants to listen. Speak naturally. If someone asks a question, answer it directly. If someone shares a story or experience, ask relevant follow-up questions using the actual words and topics from the conversation. Use the specific words and phrases they used. Be conversational and natural - respond to what they actually said, not with generic phrases.`;

        // Use Hugging Face Inference API (FREE, no API key needed for basic models)
        // Using better conversational models - try multiple options for best quality
        // Priority: BlenderBot (best for conversations) > DialoGPT-large > DialoGPT-medium
        const modelOptions = [
            'facebook/blenderbot-400M-distill',  // Best free conversational model
            'microsoft/DialoGPT-large',          // Larger, better quality
            'microsoft/DialoGPT-medium'         // Fallback
        ];
        
        let aiResponse = '';
        let lastError = null;
        
        // Try models in order of quality
        for (const modelName of modelOptions) {
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
                    },
                    parameters: {
                        return_full_text: false,
                        max_new_tokens: 150,
                        temperature: 0.7,
                        do_sample: true
                    }
                })
                });

                if (response.ok) {
                    const result = await response.json();
                    let rawResponse = result.generated_text || result[0]?.generated_text || '';
                    
                    // Check if we got a valid response
                    if (rawResponse && rawResponse.trim().length > 5) {
                        // Post-process to ensure quality responses
                        aiResponse = enhanceAIResponse(rawResponse, message, language, conversationHistory);
                        break; // Success, stop trying other models
                    }
                } else if (response.status === 503) {
                    // Model is loading, try next one
                    const errorData = await response.json().catch(() => ({}));
                    console.log(`Model ${modelName} is loading, trying next...`);
                    continue;
                } else {
                    // Other error, try next model
                    lastError = `HTTP ${response.status}`;
                    continue;
                }
            } catch (error) {
                console.log(`Error with model ${modelName}:`, error.message);
                lastError = error.message;
                continue; // Try next model
            }
        }
        
        // If all models failed, use minimal fallback
        if (!aiResponse || aiResponse.trim().length < 3) {
            console.log('All AI models failed, using minimal fallback');
            // Minimal fallback - just acknowledge and ask to continue
            aiResponse = language === 'ur-PK'
                ? 'جی، میں یہاں ہوں۔ آپ کیا کہنا چاہتے ہیں؟'
                : 'Yes, I\'m here. What would you like to tell me?';
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

                    // Migration: Add person_id column if it doesn't exist (for existing tables)
                    try {
                        // Check if person_id column exists by trying to query it
                        await env.DB.prepare('SELECT person_id FROM conversations LIMIT 1').first();
                    } catch (colError) {
                        // Column doesn't exist, add it
                        if (colError.message && colError.message.includes('no such column')) {
                            console.log('Adding person_id column to existing conversations table...');
                            await env.DB.prepare('ALTER TABLE conversations ADD COLUMN person_id TEXT').run();
                            console.log('person_id column added successfully');
                        } else {
                            // Table might not exist yet, that's okay
                            console.log('Table might not exist yet, will be created with person_id column');
                        }
                    }

                    // Save this conversation with person_id
                    const finalPersonId = (personId && personId !== 'default' && personId.trim() !== '') ? personId : 'default';
                    
                    console.log('Attempting to save conversation:', {
                        personId: personId,
                        finalPersonId: finalPersonId,
                        message: message.substring(0, 50),
                        hasDB: !!env.DB
                    });
                    
                    const insertResult = await env.DB.prepare(`
                        INSERT INTO conversations (session_id, user_message, ai_response, language, timestamp, context, person_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).bind(session, message, aiResponse, language, timestamp, JSON.stringify(conversationHistory), finalPersonId).run();
                    
                    console.log('Conversation saved successfully:', {
                        success: insertResult.success,
                        meta: insertResult.meta,
                        personId: finalPersonId,
                        rowId: insertResult.meta?.last_row_id
                    });
                } catch (dbError) {
                    console.error('ERROR saving conversation:', dbError);
                    console.error('DB Error details:', {
                        message: dbError.message,
                        stack: dbError.stack,
                        personId: personId,
                        hasDB: !!env.DB,
                        errorType: dbError.constructor.name
                    });
                    // Continue even if DB save fails - but log it
                }
            } else {
                console.error('Database not available! env.DB is:', env.DB);
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
    } catch (error) {
        console.error('Unexpected error in handleChat:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Minimal enhancement - only clean up the AI response, don't add hard-coded text
 * Trust the AI model to generate appropriate responses
 */
function enhanceAIResponse(rawResponse, userMessage, language, history) {
    if (!rawResponse || rawResponse.trim().length < 3) {
        // Only if completely empty, use minimal fallback
        return language === 'ur-PK' 
            ? 'جی، میں یہاں ہوں۔ آپ کیا کہنا چاہتے ہیں؟'
            : 'Yes, I\'m here. What would you like to tell me?';
    }
    
    let response = rawResponse.trim();
    
    // Remove any obvious artifacts or incomplete sentences
    // Remove if it's just a single word that doesn't make sense
    if (response.split(/\s+/).length === 1 && response.length < 5) {
        return language === 'ur-PK' 
            ? 'مجھے مزید بتائیں؟'
            : 'Tell me more?';
    }
    
    // Clean up common model artifacts
    response = response.replace(/^[:\-]\s*/, ''); // Remove leading colons/dashes
    response = response.replace(/\s+$/, ''); // Remove trailing whitespace
    
    // Return the AI's response as-is - trust the model
    return response;
}

// Removed hard-coded response generators - let the AI model handle everything based on conversation context

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

        // Check if person_id column exists
        let hasPersonIdColumn = false;
        try {
            await env.DB.prepare('SELECT person_id FROM conversations LIMIT 1').first();
            hasPersonIdColumn = true;
        } catch (colError) {
            // Column doesn't exist yet - old table structure
            hasPersonIdColumn = false;
        }

        let query = 'SELECT * FROM conversations';
        let params = [];
        let conditions = [];

        if (sessionId) {
            conditions.push('session_id = ?');
            params.push(sessionId);
        }

        if (personId && hasPersonIdColumn) {
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
 * Verifies admin access using secret key
 * Set ADMIN_SECRET in Cloudflare Worker environment variables
 */
function verifyAdminAccess(request, env) {
    const url = new URL(request.url);
    const providedSecret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret');
    const adminSecret = env.ADMIN_SECRET || 'CHANGE_THIS_SECRET_KEY';
    
    if (!providedSecret || providedSecret !== adminSecret) {
        return false;
    }
    return true;
}

/**
 * Handles GET /admin/data endpoint
 * Returns all conversation data (admin only)
 */
async function handleAdminGetData(request, env) {
    // Verify admin access
    const url = new URL(request.url);
    const providedSecret = url.searchParams.get('secret');
    const adminSecret = env.ADMIN_SECRET;
    
    if (!adminSecret) {
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: 'Admin secret not configured. Please set ADMIN_SECRET in Cloudflare Worker environment variables.' 
            }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
    
    if (!providedSecret || providedSecret !== adminSecret) {
        return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized. Invalid secret key.' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }

    try {
        if (!env.DB) {
            return new Response(
                JSON.stringify({ success: false, error: 'Database not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        const url = new URL(request.url);
        const personId = url.searchParams.get('personId'); // Optional: filter by person

        let query = 'SELECT * FROM conversations';
        let params = [];

        if (personId) {
            query += ' WHERE person_id = ?';
            params.push(personId);
        }

        query += ' ORDER BY timestamp ASC';

        let result;
        try {
            if (params.length > 0) {
                result = await env.DB.prepare(query).bind(...params).all();
            } else {
                result = await env.DB.prepare(query).all();
            }
        } catch (dbError) {
            // Table might not exist yet
            console.error('Error querying conversations:', dbError);
            result = { results: [] };
        }

        // Also get saved memories
        let memoriesQuery = 'SELECT * FROM grandma_memories';
        let memoriesParams = [];
        if (personId) {
            memoriesQuery += ' WHERE person_id = ?';
            memoriesParams.push(personId);
        }
        memoriesQuery += ' ORDER BY timestamp ASC';
        
        let memoriesResult;
        try {
            if (memoriesParams.length > 0) {
                memoriesResult = await env.DB.prepare(memoriesQuery).bind(...memoriesParams).all();
            } else {
                memoriesResult = await env.DB.prepare(memoriesQuery).all();
            }
        } catch (dbError) {
            // Table might not exist yet
            console.error('Error querying memories:', dbError);
            memoriesResult = { results: [] };
        }

        // Get all unique people (include 'default' and empty, but filter them out for display)
        let people = [];
        try {
            // Check if person_id column exists first
            await env.DB.prepare('SELECT person_id FROM conversations LIMIT 1').first();
            // Column exists, query it
            const peopleResult = await env.DB.prepare('SELECT DISTINCT person_id FROM conversations WHERE person_id IS NOT NULL AND person_id != \'\'').all();
            people = peopleResult.results ? peopleResult.results.map(row => row.person_id) : [];
        } catch (dbError) {
            // Column doesn't exist yet or table doesn't exist
            console.error('Error querying people (column may not exist):', dbError.message);
            people = [];
        }

        return new Response(
            JSON.stringify({
                success: true,
                conversations: result.results || [],
                memories: memoriesResult.results || [],
                people: people,
                totalConversations: result.results?.length || 0,
                totalMemories: memoriesResult.results?.length || 0
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
        console.error('Error getting admin data:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Handles POST /admin/analyze endpoint
 * Uses AI to analyze a person's conversations and generate summaries
 */
async function handleAdminAnalyze(request, env) {
    // Verify admin access
    const body = await request.json().catch(() => ({}));
    const providedSecret = body.secret || new URL(request.url).searchParams.get('secret') || request.headers.get('X-Admin-Secret');
    const adminSecret = env.ADMIN_SECRET || 'CHANGE_THIS_SECRET_KEY';
    
    if (!providedSecret || providedSecret !== adminSecret) {
        return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized. Provide secret in body or header' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }

    try {
        const { personId } = body;

        if (!personId) {
            return new Response(
                JSON.stringify({ success: false, error: 'personId required' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        if (!env.DB) {
            return new Response(
                JSON.stringify({ success: false, error: 'Database not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Get all conversations for this person
        // Check if person_id column exists first
        let conversationsResult;
        try {
            await env.DB.prepare('SELECT person_id FROM conversations LIMIT 1').first();
            // Column exists, query with person_id filter
            conversationsResult = await env.DB.prepare(
                'SELECT * FROM conversations WHERE person_id = ? ORDER BY timestamp ASC'
            ).bind(personId).all();
        } catch (colError) {
            // Column doesn't exist yet - return empty or all conversations
            console.log('person_id column does not exist yet, returning empty conversations');
            conversationsResult = { results: [] };
        }

        const conversations = conversationsResult.results || [];

        if (conversations.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'No conversations found for this person' }),
                { status: 404, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Build conversation text for analysis
        const conversationText = conversations.map(conv => 
            `User: ${conv.user_message}\nAI: ${conv.ai_response}`
        ).join('\n\n');

        // Generate analysis using AI
        const analysis = await generatePersonAnalysis(personId, conversations, conversationText);

        return new Response(
            JSON.stringify({
                success: true,
                personId: personId,
                analysis: analysis,
                stats: {
                    totalConversations: conversations.length,
                    totalMessages: conversations.length * 2,
                    dateRange: {
                        first: conversations[0]?.timestamp,
                        last: conversations[conversations.length - 1]?.timestamp
                    }
                }
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
        console.error('Error analyzing person:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Generates AI-powered analysis of a person's conversations
 */
async function generatePersonAnalysis(personId, conversations, conversationText) {
    // Create a comprehensive prompt for analysis
    const analysisPrompt = `Analyze the following conversations with a person and provide:
1. A brief summary of who this person is
2. Key topics and themes they discuss
3. Personality traits and characteristics
4. Important life events mentioned
5. Family and relationships
6. Values and beliefs
7. Memorable stories or anecdotes

Conversations:
${conversationText.substring(0, 8000)} ${conversationText.length > 8000 ? '... (truncated)' : ''}

Provide a structured analysis in JSON format with these sections:
{
  "summary": "Brief overview",
  "topics": ["topic1", "topic2"],
  "personality": ["trait1", "trait2"],
  "lifeEvents": ["event1", "event2"],
  "relationships": ["relationship1", "relationship2"],
  "values": ["value1", "value2"],
  "stories": ["story1", "story2"]
}`;

    try {
        // Use Hugging Face for text generation/analysis
        const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: analysisPrompt
            })
        });

        if (response.ok) {
            const result = await response.json();
            const aiAnalysis = result.generated_text || result[0]?.generated_text || '';
            
            // Try to extract JSON from response, or return as text
            try {
                const jsonMatch = aiAnalysis.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                // If JSON parsing fails, return structured text analysis
            }
            
            return {
                summary: aiAnalysis.substring(0, 500),
                rawAnalysis: aiAnalysis,
                note: 'AI analysis generated. Parse manually if needed.'
            };
        } else {
            // Fallback: Generate basic analysis from patterns
            return generateBasicAnalysis(conversations, conversationText);
        }
    } catch (error) {
        console.error('AI analysis error:', error);
        return generateBasicAnalysis(conversations, conversationText);
    }
}

/**
 * Generates basic analysis when AI is unavailable
 */
function generateBasicAnalysis(conversations, conversationText) {
    const text = conversationText.toLowerCase();
    const topics = [];
    const personality = [];
    
    // Extract topics
    if (text.includes('family') || text.includes('parent')) topics.push('Family');
    if (text.includes('childhood') || text.includes('grew up')) topics.push('Childhood');
    if (text.includes('work') || text.includes('job')) topics.push('Work/Career');
    if (text.includes('travel') || text.includes('visit')) topics.push('Travel');
    if (text.includes('school') || text.includes('education')) topics.push('Education');
    if (text.includes('marry') || text.includes('spouse')) topics.push('Marriage');
    
    // Extract personality hints
    if (text.includes('love') || text.includes('care')) personality.push('Caring');
    if (text.includes('hard work') || text.includes('dedicated')) personality.push('Hardworking');
    if (text.includes('funny') || text.includes('humor')) personality.push('Humorous');
    if (text.includes('adventure') || text.includes('explore')) personality.push('Adventurous');
    
    return {
        summary: `This person has shared ${conversations.length} conversations covering various aspects of their life.`,
        topics: [...new Set(topics)],
        personality: [...new Set(personality)],
        lifeEvents: [],
        relationships: [],
        values: [],
        stories: [],
        note: 'Basic pattern-based analysis. Use AI endpoint for detailed analysis.'
    };
}

/**
 * Handles POST /admin/query endpoint
 * Allows querying conversations with natural language
 */
async function handleAdminQuery(request, env) {
    // Verify admin access
    const body = await request.json().catch(() => ({}));
    const providedSecret = body.secret || new URL(request.url).searchParams.get('secret') || request.headers.get('X-Admin-Secret');
    const adminSecret = env.ADMIN_SECRET || 'CHANGE_THIS_SECRET_KEY';
    
    if (!providedSecret || providedSecret !== adminSecret) {
        return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized. Provide secret in body or header' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }

    try {
        const { query, personId } = body;

        if (!query) {
            return new Response(
                JSON.stringify({ success: false, error: 'query required' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        if (!env.DB) {
            return new Response(
                JSON.stringify({ success: false, error: 'Database not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Search conversations
        // Check if person_id column exists
        let hasPersonIdColumn = false;
        try {
            await env.DB.prepare('SELECT person_id FROM conversations LIMIT 1').first();
            hasPersonIdColumn = true;
        } catch (colError) {
            hasPersonIdColumn = false;
        }

        let searchQuery = 'SELECT * FROM conversations WHERE (user_message LIKE ? OR ai_response LIKE ?)';
        let params = [`%${query}%`, `%${query}%`];

        if (personId && hasPersonIdColumn) {
            searchQuery += ' AND person_id = ?';
            params.push(personId);
        }

        searchQuery += ' ORDER BY timestamp DESC LIMIT 50';

        const result = await env.DB.prepare(searchQuery).bind(...params).all();

        return new Response(
            JSON.stringify({
                success: true,
                query: query,
                results: result.results || [],
                count: result.results?.length || 0
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
        console.error('Error querying:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error', details: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    }
}

/**
 * Test database connectivity endpoint
 */
async function handleTestDB(request, env) {
    try {
        if (!env.DB) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: 'Database not configured. Check wrangler.jsonc database binding.' 
                }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Try to create table
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

        // Try to query
        const testQuery = await env.DB.prepare('SELECT COUNT(*) as count FROM conversations').first();
        const count = testQuery?.count || 0;

        // Try to insert a test record
        const testInsert = await env.DB.prepare(`
            INSERT INTO conversations (session_id, user_message, ai_response, language, timestamp, context, person_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind('test_session', 'test message', 'test response', 'en-US', new Date().toISOString(), '[]', 'test').run();

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Database is working!',
                details: {
                    hasDB: !!env.DB,
                    currentCount: count,
                    testInsertSuccess: testInsert.success,
                    testInsertId: testInsert.meta?.last_row_id
                }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Database test failed',
                details: error.message,
                stack: error.stack
            }),
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

