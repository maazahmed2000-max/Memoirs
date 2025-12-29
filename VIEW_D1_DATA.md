# How to View Raw D1 Database Data

There are several ways to view your raw data directly in Cloudflare D1:

## Method 1: Cloudflare Dashboard (Easiest)

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com
2. **Navigate to D1**:
   - Click "Workers & Pages" in the left sidebar
   - Click "D1" (or go directly to D1 section)
3. **Select your database**: `grandma-memory-db`
4. **View Tables**:
   - Click on the database
   - You'll see all tables: `conversations`, `grandma_memories`
   - Click on any table to see all rows
   - You can filter, sort, and search directly in the UI

## Method 2: Wrangler CLI (Command Line)

### View All Conversations
```bash
wrangler d1 execute grandma-memory-db --command "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT 100"
```

### View All Memories
```bash
wrangler d1 execute grandma-memory-db --command "SELECT * FROM grandma_memories ORDER BY timestamp DESC"
```

### View All People
```bash
wrangler d1 execute grandma-memory-db --command "SELECT DISTINCT person_id FROM conversations WHERE person_id IS NOT NULL AND person_id != ''"
```

### View Conversations for Specific Person
```bash
wrangler d1 execute grandma-memory-db --command "SELECT * FROM conversations WHERE person_id = 'maaz' ORDER BY timestamp DESC"
```

### Count Records
```bash
wrangler d1 execute grandma-memory-db --command "SELECT COUNT(*) as total FROM conversations"
wrangler d1 execute grandma-memory-db --command "SELECT person_id, COUNT(*) as count FROM conversations GROUP BY person_id"
```

### Export to JSON
```bash
wrangler d1 execute grandma-memory-db --command "SELECT * FROM conversations" --json > conversations.json
```

## Method 3: SQL Queries in Dashboard

In the Cloudflare Dashboard D1 interface, you can run custom SQL queries:

```sql
-- See all conversations
SELECT * FROM conversations ORDER BY timestamp DESC;

-- See conversations by person
SELECT person_id, COUNT(*) as message_count 
FROM conversations 
GROUP BY person_id 
ORDER BY message_count DESC;

-- See recent conversations for a person
SELECT user_message, ai_response, timestamp 
FROM conversations 
WHERE person_id = 'maaz' 
ORDER BY timestamp DESC 
LIMIT 20;

-- See all data (conversations + memories)
SELECT 'conversation' as type, person_id, user_message as content, timestamp 
FROM conversations
UNION ALL
SELECT 'memory' as type, person_id, text as content, timestamp 
FROM grandma_memories
ORDER BY timestamp DESC;
```

## Method 4: Direct API Access (Programmatic)

You can also query via the D1 REST API, but the dashboard is easier for viewing.

## Quick Reference

**Database Name**: `grandma-memory-db`  
**Database ID**: `db772d7b-b42b-43fa-918e-642e7c3e26b6` (from wrangler.jsonc)

**Tables**:
- `conversations` - All chat conversations
- `grandma_memories` - Saved memories/text

**Key Columns**:
- `person_id` - The person's identifier (e.g., 'maaz', 'grandma')
- `timestamp` - When the record was created
- `user_message` - What the user said
- `ai_response` - What the AI responded
- `language` - Language used (en-US, ur-PK)

## Troubleshooting

If you don't see data:
1. Make sure conversations have been saved (check that personId is set in the app)
2. Check that the database binding is correct in wrangler.jsonc
3. Verify the worker is deployed and running
4. Check Cloudflare Worker logs for any database errors

