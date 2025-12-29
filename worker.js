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
        // Priority: Try simpler, more reliable models first
        const modelOptions = [
            'microsoft/DialoGPT-medium',         // Most reliable, works without auth
            'microsoft/DialoGPT-large',          // Larger version
            'facebook/blenderbot-400M-distill',  // May need different format
            'gpt2'                                // Simple text generation as last resort
        ];
        
        let aiResponse = '';
        let lastError = null;
        
        // Try models in order of quality
        for (const modelName of modelOptions) {
            try {
                // Build request body based on model type
                let requestBody;
                if (modelName === 'gpt2') {
                    // GPT-2 uses simple text generation format
                    const conversationText = recentHistory.map(h => `Human: ${h.user}\nAI: ${h.ai}`).join('\n\n') + `\n\nHuman: ${message}\nAI:`;
                    requestBody = {
                        inputs: conversationText,
                        parameters: {
                            max_new_tokens: 60,
                            temperature: 0.7,
                            return_full_text: false
                        }
                    };
                } else {
                    // Conversational models use dialogue format
                    requestBody = {
                        inputs: {
                            past_user_inputs: recentHistory.map(m => m.user).slice(-5),
                            generated_responses: recentHistory.map(m => m.ai).slice(-5),
                            text: message
                        }
                    };
                }
                
                const response = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                    const result = await response.json();
                    
                    // Log the raw response for debugging
                    console.log(`Model ${modelName} response:`, JSON.stringify(result).substring(0, 200));
                    
                    // Try multiple possible response formats
                    let rawResponse = '';
                    
                    // Format 1: Direct generated_text
                    if (result.generated_text) {
                        rawResponse = result.generated_text;
                    }
                    // Format 2: Array with generated_text
                    else if (Array.isArray(result) && result[0]?.generated_text) {
                        rawResponse = result[0].generated_text;
                    }
                    // Format 3: Array with text property
                    else if (Array.isArray(result) && result[0]?.text) {
                        rawResponse = result[0].text;
                    }
                    // Format 4: Direct text property
                    else if (result.text) {
                        rawResponse = result.text;
                    }
                    // Format 5: Conversational model format
                    else if (result.conversation?.generated_responses && result.conversation.generated_responses.length > 0) {
                        rawResponse = result.conversation.generated_responses[result.conversation.generated_responses.length - 1];
                    }
                    // Format 6: Check if it's a string directly
                    else if (typeof result === 'string') {
                        rawResponse = result;
                    }
                    // Format 7: GPT-2 style (array with generated_text)
                    else if (Array.isArray(result) && result.length > 0) {
                        if (result[0]?.generated_text) {
                            rawResponse = result[0].generated_text;
                            // Extract just the AI part if it contains "AI:"
                            if (rawResponse.includes('AI:')) {
                                rawResponse = rawResponse.split('AI:').pop().trim();
                            }
                        }
                    }
                    
                    // Clean and check response
                    rawResponse = rawResponse ? String(rawResponse).trim() : '';
                    
                    // Remove any leading/trailing quotes or punctuation artifacts
                    rawResponse = rawResponse.replace(/^["'`]+|["'`]+$/g, '').trim();
                    
                    console.log(`Extracted response from ${modelName}:`, rawResponse.substring(0, 100));
                    
                    // Check if we got a valid response (at least 3 characters, not just punctuation)
                    if (rawResponse && rawResponse.length > 3 && rawResponse.match(/[a-zA-Z\u0600-\u06FF]/)) {
                        // Post-process to ensure quality responses
                        const enhanced = enhanceAIResponse(rawResponse, message, language, conversationHistory);
                        if (enhanced) {
                            aiResponse = enhanced;
                            console.log(`Using response from ${modelName}`);
                            break; // Success, stop trying other models
                        } else {
                            console.log(`Model ${modelName} response was filtered out (generic), trying next...`);
                        }
                    } else {
                        console.log(`Model ${modelName} returned empty/invalid response (${rawResponse.length} chars), trying next...`);
                    }
                } else if (response.status === 503) {
                    // Model is loading, try next one
                    const errorData = await response.json().catch(() => ({}));
                    console.log(`Model ${modelName} is loading (503), trying next...`);
                    continue;
                } else {
                    // Other error, try next model
                    const errorText = await response.text().catch(() => '');
                    console.log(`Model ${modelName} error (${response.status}):`, errorText.substring(0, 200));
                    lastError = `HTTP ${response.status}`;
                    continue;
                }
            } catch (error) {
                console.log(`Error with model ${modelName}:`, error.message);
                lastError = error.message;
                continue; // Try next model
            }
        }
        
        // If all conversational models failed, try a simple text generation model
        if (!aiResponse || aiResponse.trim().length < 3) {
            console.log('All conversational models failed, trying text generation model...');
            
            try {
                // Try a simple text generation model with better prompt
                const conversationText = recentHistory.map(h => `Human: ${h.user}\nAI: ${h.ai}`).join('\n\n') + `\n\nHuman: ${message}\nAI:`;
                
                const textGenResponse = await fetch('https://api-inference.huggingface.co/models/gpt2', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        inputs: conversationText,
                        parameters: {
                            max_new_tokens: 50,
                            temperature: 0.8,
                            return_full_text: false
                        }
                    })
                });
                
                if (textGenResponse.ok) {
                    const textGenResult = await textGenResponse.json();
                    let genText = '';
                    
                    if (textGenResult[0]?.generated_text) {
                        genText = textGenResult[0].generated_text;
                    } else if (typeof textGenResult === 'string') {
                        genText = textGenResult;
                    }
                    
                    // Extract just the AI part (after "AI:")
                    const aiPart = genText.split('AI:').pop() || genText;
                    const cleaned = aiPart.split('\n')[0].trim();
                    
                    if (cleaned && cleaned.length > 5) {
                        aiResponse = enhanceAIResponse(cleaned, message, language, conversationHistory);
                        console.log('Got response from GPT-2 fallback');
                    }
                }
            } catch (fallbackError) {
                console.log('Text generation fallback also failed:', fallbackError.message);
            }
        }
        
        // If still no response, generate contextual response based on conversation
        if (!aiResponse || aiResponse.trim().length < 3) {
            console.log('All AI models failed, generating contextual response from conversation');
            
            // Generate a contextual response based on what the user actually said
            const lowerMessage = message.toLowerCase();
            
            // Handle specific questions naturally
            if (lowerMessage.includes('hear') || lowerMessage.includes('there') || lowerMessage.includes('can you')) {
                aiResponse = language === 'ur-PK'
                    ? 'جی ہاں، میں آپ کو سن رہا ہوں! آپ کیا کہنا چاہتے ہیں؟'
                    : 'Yes, I can hear you! What would you like to tell me?';
            } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
                aiResponse = language === 'ur-PK'
                    ? 'ہیلو! آپ سے مل کر خوشی ہوئی۔ آپ مجھے اپنے بارے میں کچھ بتائیں۔'
                    : 'Hello! Nice to meet you. Tell me about yourself.';
            } else if (lowerMessage.includes('name')) {
                const nameMatch = message.match(/(?:my name is|i'm|i am|میرا نام)\s+(\w+)/i);
                const name = nameMatch ? nameMatch[1] : '';
                aiResponse = language === 'ur-PK'
                    ? name ? `آپ سے مل کر بہت خوشی ہوئی، ${name}! آپ کہاں رہتے ہیں؟` : 'آپ سے مل کر خوشی ہوئی! آپ کا نام کیا ہے؟'
                    : name ? `Nice to meet you, ${name}! Where are you from?` : 'Nice to meet you! What\'s your name?';
            } else {
                // Use conversation context to generate a follow-up question
                const lastTopic = recentHistory.length > 0 ? recentHistory[recentHistory.length - 1].user.toLowerCase() : '';
                
                if (lastTopic.includes('childhood') || lastTopic.includes('grew up')) {
                    aiResponse = language === 'ur-PK'
                        ? 'آپ کے بچپن کے بارے میں مزید بتائیں؟'
                        : 'Tell me more about your childhood?';
                } else if (lastTopic.includes('family') || lastTopic.includes('parent')) {
                    aiResponse = language === 'ur-PK'
                        ? 'آپ کے خاندان کے بارے میں مزید بتائیں؟'
                        : 'Tell me more about your family?';
                } else if (lastTopic.includes('work') || lastTopic.includes('job')) {
                    aiResponse = language === 'ur-PK'
                        ? 'آپ کے کام کے بارے میں مزید بتائیں؟'
                        : 'Tell me more about your work?';
                } else {
                    // Generate varied responses based on what was actually said
                    const messageWords = message.toLowerCase().split(/\s+/);
                    const hasQuestion = message.includes('?');
                    
                    if (hasQuestion) {
                        // If they asked a question, acknowledge and ask them to elaborate
                        aiResponse = language === 'ur-PK'
                            ? 'یہ اچھا سوال ہے! آپ اس کے بارے میں کیا سوچتے ہیں؟'
                            : 'That\'s a good question! What do you think about that?';
                    } else if (messageWords.length < 5) {
                        // Short statement - ask for more details
                        aiResponse = language === 'ur-PK'
                            ? 'وہ کیسا تھا؟'
                            : 'What was that like?';
                    } else {
                        // Longer statement - acknowledge and continue conversation naturally
                        aiResponse = language === 'ur-PK'
                            ? 'یہ بہت دلچسپ ہے! پھر کیا ہوا؟'
                            : 'That\'s interesting! What happened next?';
                    }
                }
            }
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
        // Return null to trigger contextual fallback instead of generic response
        return null;
    }
    
    let response = rawResponse.trim();
    
    // Remove any obvious artifacts or incomplete sentences
    // Remove if it's just a single word that doesn't make sense
    if (response.split(/\s+/).length === 1 && response.length < 5) {
        return null; // Use contextual fallback
    }
    
    // Filter out generic "tell me more" responses - let contextual fallback handle it
    const lowerResponse = response.toLowerCase();
    if ((lowerResponse.includes('tell me more') || lowerResponse.includes('tell me about')) && response.length < 40) {
        return null; // Filter out generic "tell me more" - use contextual fallback instead
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

        // Get all conversations AND memories for this person
        // Check if person_id column exists first
        let conversationsResult;
        let memoriesResult;
        
        try {
            await env.DB.prepare('SELECT person_id FROM conversations LIMIT 1').first();
            // Column exists, query with person_id filter
            conversationsResult = await env.DB.prepare(
                'SELECT * FROM conversations WHERE person_id = ? ORDER BY timestamp ASC'
            ).bind(personId).all();
        } catch (colError) {
            // Column doesn't exist yet - return empty
            console.log('person_id column does not exist yet, returning empty conversations');
            conversationsResult = { results: [] };
        }

        // Get memories for this person (ensure table exists)
        try {
            // Ensure grandma_memories table exists (older deployments might not have it)
            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS grandma_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT,
                    language TEXT,
                    timestamp TEXT,
                    person_id TEXT
                )
            `).run();

            memoriesResult = await env.DB.prepare(
                'SELECT * FROM grandma_memories WHERE person_id = ? ORDER BY timestamp ASC'
            ).bind(personId).all();
        } catch (memError) {
            console.log('Error getting memories:', memError);
            memoriesResult = { results: [] };
        }

        const conversations = conversationsResult.results || [];
        const memories = memoriesResult.results || [];

        if (conversations.length === 0 && memories.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'No conversations or memories found for this person' }),
                { status: 404, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Build comprehensive text for analysis - include both conversations and memories
        const conversationText = conversations.map(conv => 
            `[${new Date(conv.timestamp).toLocaleDateString()}] User: ${conv.user_message}\nAI: ${conv.ai_response}`
        ).join('\n\n');
        
        const memoriesText = memories.map(mem => 
            `[${new Date(mem.timestamp).toLocaleDateString()}] Memory: ${mem.text}`
        ).join('\n\n');
        
        const allText = [
            memoriesText && memoriesText.length > 0 ? `=== SAVED MEMORIES ===\n${memoriesText}` : '',
            conversationText && conversationText.length > 0 ? `=== CONVERSATIONS ===\n${conversationText}` : ''
        ].filter(Boolean).join('\n\n');

        // Generate comprehensive book-like analysis
        const analysis = await generatePersonAnalysis(personId, conversations, memories, allText);

        return new Response(
            JSON.stringify({
                success: true,
                personId: personId,
                analysis: analysis,
                stats: {
                    totalConversations: conversations.length,
                    totalMemories: memories.length,
                    totalMessages: conversations.length * 2,
                    dateRange: {
                        first: conversations[0]?.timestamp || memories[0]?.timestamp,
                        last: conversations[conversations.length - 1]?.timestamp || memories[memories.length - 1]?.timestamp
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
 * Generates comprehensive, book-like AI analysis of a person's life from conversations and memories
 * Creates a detailed narrative biography
 */
async function generatePersonAnalysis(personId, conversations, memories, allText) {
    // Create a comprehensive, book-like prompt for analysis
    const analysisPrompt = `You are writing a comprehensive biography book about a person based on their conversations and saved memories. Create a detailed, narrative-style analysis that reads like chapters of a book.

Write a comprehensive biography with the following structure:

1. **Introduction & Overview** (2-3 paragraphs): Who is this person? What is their background? What makes them unique?

2. **Early Life & Childhood** (detailed section): Where did they grow up? What was their childhood like? Family background, early experiences, education.

3. **Personality & Character** (detailed section): What are their defining personality traits? How do they approach life? What are their strengths, quirks, and characteristics?

4. **Life Journey & Experiences** (detailed section): Major life events, transitions, challenges, and achievements. Tell their story chronologically where possible.

5. **Relationships & Family** (detailed section): Family members, friends, important relationships. How did they meet? What were these relationships like?

6. **Values, Beliefs & Philosophy** (detailed section): What do they value? What are their beliefs? What principles guide their life?

7. **Memorable Stories & Anecdotes** (detailed section): Specific stories, memories, and anecdotes they shared. Include details and context.

8. **Key Themes & Topics** (summary): What topics do they frequently discuss? What are the recurring themes in their life?

9. **Conclusion** (1-2 paragraphs): Summary of their life's essence, legacy, and what makes them special.

Write this as a flowing narrative, like chapters in a biography book. Be detailed, specific, and use the actual words and details from their conversations and memories. Include dates, places, names, and specific events mentioned.

Data to analyze:
${allText.substring(0, 15000)} ${allText.length > 15000 ? '\n\n... (additional content truncated for length)' : ''}

Provide your analysis as a comprehensive book-like narrative in JSON format:
{
  "book": {
    "title": "The Life Story of [Name]",
    "introduction": "Detailed introduction paragraph(s)",
    "earlyLife": "Detailed early life section",
    "personality": "Detailed personality section",
    "lifeJourney": "Detailed life journey section",
    "relationships": "Detailed relationships section",
    "values": "Detailed values and beliefs section",
    "stories": "Detailed stories and anecdotes section",
    "themes": "Summary of key themes",
    "conclusion": "Conclusion paragraph(s)"
  },
  "summary": "Brief 2-3 sentence overview",
  "topics": ["topic1", "topic2", "topic3"],
  "personality": ["trait1", "trait2", "trait3"],
  "lifeEvents": ["event1", "event2", "event3"],
  "relationships": ["relationship1", "relationship2"],
  "values": ["value1", "value2"],
  "stories": ["story1", "story2", "story3"]
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
            // Fallback: Generate comprehensive analysis from patterns
            console.log('AI analysis API failed, using pattern-based analysis');
            return generateComprehensiveAnalysis(conversations, memories, allText);
        }
    } catch (error) {
        console.error('AI analysis error:', error);
        console.error('Error details:', error.message, error.stack);
        // Always return fallback analysis instead of failing
        try {
            return generateComprehensiveAnalysis(conversations, memories, allText);
        } catch (fallbackError) {
            console.error('Fallback analysis also failed:', fallbackError);
            // Return minimal structure to prevent errors
            return {
                book: {
                    title: `The Life Story of ${personId}`,
                    introduction: `This biography is compiled from ${conversations.length} conversations and ${memories.length} memories.`,
                    earlyLife: 'Early life details from conversations.',
                    personality: 'Personality traits mentioned in conversations.',
                    lifeJourney: 'Life events and experiences shared.',
                    relationships: 'Relationships and family members mentioned.',
                    values: 'Values and beliefs expressed.',
                    stories: 'Stories and anecdotes shared.',
                    themes: 'Key topics discussed.',
                    conclusion: 'A life rich with experiences and stories.'
                },
                summary: `This person has shared ${conversations.length} conversations covering various aspects of their life.`,
                topics: [],
                personality: [],
                lifeEvents: [],
                relationships: [],
                values: [],
                stories: []
            };
        }
    }
}

/**
 * Generates comprehensive book-like analysis when AI is unavailable
 * Creates detailed narrative from conversations and memories
 */
function generateComprehensiveAnalysis(conversations, memories, allText) {
    try {
        // Extract key information from conversations and memories
        const text = allText.toLowerCase();
        const allEntries = [
            ...conversations.map(c => ({ type: 'conversation', text: `${c.user_message} ${c.ai_response}`, date: c.timestamp })),
            ...memories.map(m => ({ type: 'memory', text: m.text, date: m.timestamp }))
        ].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Extract topics, events, relationships
        const topics = extractTopics(text);
        const events = extractLifeEvents(text, allEntries);
        const relationships = extractRelationships(text);
        const personality = extractPersonality(text);
        const values = extractValues(text);
        const stories = extractStories(allEntries);
        
        // Build comprehensive book-like structure
        const book = {
            title: `The Life Story`,
            introduction: buildIntroduction(conversations, memories, topics),
            earlyLife: buildEarlyLifeSection(text, events),
            personality: buildPersonalitySection(personality, text),
            lifeJourney: buildLifeJourneySection(events, allEntries),
            relationships: buildRelationshipsSection(relationships, text),
            values: buildValuesSection(values, text),
            stories: buildStoriesSection(stories),
            themes: topics.join(', ') || 'Life experiences',
            conclusion: buildConclusion(topics, personality, values)
        };
        
        return {
            book: book,
            summary: book.introduction.substring(0, 300),
            topics: topics.slice(0, 10),
            personality: personality.slice(0, 10),
            lifeEvents: events.slice(0, 15),
            relationships: relationships.slice(0, 10),
            values: values.slice(0, 8),
            stories: stories.slice(0, 10)
        };
    } catch (error) {
        console.error('Error in generateComprehensiveAnalysis:', error);
        // Return minimal structure on error
        return {
            book: {
                title: 'The Life Story',
                introduction: `This biography is compiled from ${conversations.length} conversations and ${memories.length} memories.`,
                earlyLife: 'Early life details from conversations.',
                personality: 'Personality traits mentioned in conversations.',
                lifeJourney: 'Life events and experiences shared.',
                relationships: 'Relationships and family members mentioned.',
                values: 'Values and beliefs expressed.',
                stories: 'Stories and anecdotes shared.',
                themes: 'Key topics discussed.',
                conclusion: 'A life rich with experiences and stories.'
            },
            summary: `This person has shared ${conversations.length} conversations covering various aspects of their life.`,
            topics: [],
            personality: [],
            lifeEvents: [],
            relationships: [],
            values: [],
            stories: []
        };
    }
}

function extractTopics(text) {
    const topicKeywords = {
        'childhood': 'Childhood & Early Years',
        'family': 'Family',
        'work': 'Work & Career',
        'school': 'Education',
        'travel': 'Travel & Adventures',
        'marriage': 'Marriage & Relationships',
        'friends': 'Friendships',
        'hobbies': 'Hobbies & Interests',
        'health': 'Health & Wellness',
        'religion': 'Religion & Spirituality'
    };
    
    const found = [];
    for (const [key, label] of Object.entries(topicKeywords)) {
        if (text.includes(key)) found.push(label);
    }
    return found.length > 0 ? found : ['Life Experiences', 'Personal Stories'];
}

function extractLifeEvents(text, entries) {
    const events = [];
    const eventKeywords = ['born', 'graduated', 'married', 'moved', 'started', 'retired', 'traveled', 'met'];
    
    entries.forEach(entry => {
        const entryText = entry.text.toLowerCase();
        eventKeywords.forEach(keyword => {
            if (entryText.includes(keyword)) {
                const sentence = entry.text.split(/[.!?]/).find(s => s.toLowerCase().includes(keyword));
                if (sentence) events.push(sentence.trim());
            }
        });
    });
    
    return events.slice(0, 20);
}

function extractRelationships(text) {
    const relationships = [];
    const relKeywords = ['mother', 'father', 'wife', 'husband', 'son', 'daughter', 'brother', 'sister', 'friend', 'grandmother', 'grandfather'];
    
    relKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
            relationships.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
        }
    });
    
    return [...new Set(relationships)];
}

function extractPersonality(text) {
    const traits = [];
    const traitKeywords = {
        'kind': 'Kind',
        'patient': 'Patient',
        'curious': 'Curious',
        'hardworking': 'Hardworking',
        'loving': 'Loving',
        'funny': 'Humorous',
        'creative': 'Creative',
        'brave': 'Brave',
        'wise': 'Wise',
        'generous': 'Generous'
    };
    
    for (const [key, trait] of Object.entries(traitKeywords)) {
        if (text.includes(key)) traits.push(trait);
    }
    
    return traits.length > 0 ? traits : ['Thoughtful', 'Reflective'];
}

function extractValues(text) {
    const values = [];
    const valueKeywords = {
        'family': 'Family',
        'honesty': 'Honesty',
        'hard work': 'Hard Work',
        'education': 'Education',
        'faith': 'Faith',
        'respect': 'Respect',
        'love': 'Love',
        'tradition': 'Tradition'
    };
    
    for (const [key, value] of Object.entries(valueKeywords)) {
        if (text.includes(key)) values.push(value);
    }
    
    return values.length > 0 ? values : ['Personal Growth', 'Connection'];
}

function extractStories(entries) {
    // Extract longer entries as stories
    return entries
        .filter(e => e.text.length > 100)
        .map(e => e.text.substring(0, 300))
        .slice(0, 15);
}

function buildIntroduction(conversations, memories, topics) {
    const totalEntries = conversations.length + memories.length;
    return `This is a comprehensive biography compiled from ${totalEntries} conversations and ${memories.length} saved memories. The person shared stories about ${topics.slice(0, 3).join(', ')} and many other aspects of their life. This book captures their essence, experiences, and the wisdom they've gathered over the years.`;
}

function buildEarlyLifeSection(text, events) {
    const earlyEvents = events.filter(e => e.toLowerCase().includes('child') || e.toLowerCase().includes('grew up') || e.toLowerCase().includes('school'));
    if (earlyEvents.length > 0) {
        return `Early life was marked by significant experiences: ${earlyEvents.slice(0, 3).join('. ')}. ${text.includes('childhood') ? 'Their childhood stories reveal a rich tapestry of memories and formative experiences.' : ''}`;
    }
    return 'Early life details were shared through conversations, revealing formative years and childhood experiences.';
}

function buildPersonalitySection(personality, text) {
    return `This person demonstrates ${personality.slice(0, 5).join(', ')}. Their personality shines through in how they tell stories, interact with others, and reflect on their experiences.`;
}

function buildLifeJourneySection(events, entries) {
    const chronological = entries.slice(0, 20).map(e => `[${new Date(e.date).getFullYear()}] ${e.text.substring(0, 150)}`).join('\n\n');
    return `Life's journey unfolded through many chapters:\n\n${chronological}`;
}

function buildRelationshipsSection(relationships, text) {
    return `Important relationships included ${relationships.slice(0, 5).join(', ')}. These connections shaped their life and provided support, love, and companionship throughout the years.`;
}

function buildValuesSection(values, text) {
    return `Core values that guided their life include ${values.slice(0, 5).join(', ')}. These principles influenced their decisions and how they lived.`;
}

function buildStoriesSection(stories) {
    return stories.map((story, i) => `Story ${i + 1}: ${story}...`).join('\n\n');
}

function buildConclusion(topics, personality, values) {
    return `This biography captures the essence of a life well-lived, filled with ${topics.slice(0, 2).join(' and ')}, characterized by ${personality.slice(0, 2).join(' and ')}, and guided by values of ${values.slice(0, 2).join(' and ')}. Their stories and memories form a rich legacy.`;
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

