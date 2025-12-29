-- Create conversations table for storing chat history
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_message TEXT,
    ai_response TEXT,
    language TEXT,
    timestamp TEXT,
    context TEXT
);

-- Note: The grandma_memories table should already exist from your previous setup
-- If it doesn't, uncomment the line below:
-- CREATE TABLE IF NOT EXISTS grandma_memories (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     text TEXT,
--     language TEXT,
--     timestamp TEXT
-- );

