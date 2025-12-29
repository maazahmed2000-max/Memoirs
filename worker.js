/**
 * Cloudflare Worker for Grandma Memories App
 * 
 * This worker handles:
 * 1. Saving transcribed text to a D1 SQLite database
 * 2. Conversational AI for natural conversations and follow-up questions
 * 3. Storing complete conversation history
 * 
 * Database Schema:
 * - grandma_memories: id, text, language, timestamp
 * - conversations: id, user_message, ai_response, language, timestamp, session_id, context
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

        // Insert into D1 database
        // The database table should be named 'grandma_memories' with columns:
        // - id (INTEGER PRIMARY KEY AUTOINCREMENT)
        // - text (TEXT)
        // - language (TEXT)
        // - timestamp (TEXT)
        try {
            const result = await env.DB.prepare(
                `INSERT INTO grandma_memories (text, language, timestamp) 
                 VALUES (?, ?, ?)`
            )
            .bind(text, language, timestamp)
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

        const { message, language = 'en-US', sessionId, conversationHistory = [] } = body;

        if (!message || typeof message !== 'string') {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing message' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...getCORSHeaders() } }
            );
        }

        // Build conversation context for the AI
        const systemPrompt = language === 'ur-PK' 
            ? `آپ ایک دوستانہ، دلچسپ بات چیت کرنے والے AI ہیں جو کسی شخص کی زندگی، کہانیاں، اور شخصیت کے بارے میں جاننے میں دلچسپی رکھتے ہیں۔ قدرتی طور پر بات کریں، تفصیلی سوالات پوچھیں، اور ان کی کہانیوں کو یاد رکھیں۔`
            : `You are a friendly, curious conversational AI interested in learning about a person's life, stories, and personality. Have natural conversations, ask detailed follow-up questions, and remember their stories.`;

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
                aiResponse = result.generated_text || result[0]?.generated_text || 'I understand. Can you tell me more about that?';
            } else {
                // Fallback: Use a simple rule-based response if API fails
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
                            context TEXT
                        )
                    `).run();

                    // Save this conversation
                    await env.DB.prepare(`
                        INSERT INTO conversations (session_id, user_message, ai_response, language, timestamp, context)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).bind(session, message, aiResponse, language, timestamp, JSON.stringify(conversationHistory)).run();
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
 * Generates a fallback response when AI API is unavailable
 * Uses simple pattern matching and context awareness
 */
function generateFallbackResponse(message, language, history) {
    const msg = message.toLowerCase();
    
    if (language === 'ur-PK') {
        // Urdu responses
        if (msg.includes('ہیلو') || msg.includes('سلام')) {
            return 'سلام! آپ کیسے ہیں؟ آپ مجھے اپنی زندگی کے بارے میں کچھ بتائیں۔';
        }
        if (msg.includes('کہانی') || msg.includes('یاد')) {
            return 'یہ بہت دلچسپ لگ رہا ہے! براہ کرم مزید تفصیلات بتائیں۔ کیا آپ اس وقت کے بارے میں مزید بتا سکتے ہیں؟';
        }
        if (msg.includes('خاندان') || msg.includes('گھر')) {
            return 'آپ کے خاندان کے بارے میں مزید بتائیں۔ آپ کہاں رہتے تھے؟';
        }
        return 'یہ بہت دلچسپ ہے! براہ کرم مزید بتائیں۔ میں سن رہا ہوں۔';
    } else {
        // English responses
        if (msg.includes('hello') || msg.includes('hi')) {
            return 'Hello! How are you? Tell me about yourself and your life.';
        }
        if (msg.includes('story') || msg.includes('remember') || msg.includes('when')) {
            return 'That sounds interesting! Can you tell me more details? What else happened?';
        }
        if (msg.includes('family') || msg.includes('home') || msg.includes('childhood')) {
            return 'Tell me more about your family. Where did you grow up?';
        }
        return 'That\'s fascinating! Please tell me more. I\'m listening.';
    }
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
        const limit = parseInt(url.searchParams.get('limit') || '100');

        let query = 'SELECT * FROM conversations';
        let params = [];

        if (sessionId) {
            query += ' WHERE session_id = ?';
            params.push(sessionId);
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

