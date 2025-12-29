# Admin Access Guide

## Overview

This guide explains how to access and analyze the saved conversation data. **Only you (the admin) can access this data** - regular users cannot see this.

## 🎯 Quick Start: Use the Dashboard

**The easiest way to access your data is through the web dashboard:**

1. Open `admin.html` in your browser (or host it on GitHub Pages)
2. Enter your admin secret (the one you set in Cloudflare Worker environment variables)
3. Click "Login"
4. Browse all people, view conversations, and run AI analysis!

The dashboard provides:
- ✅ Visual overview of all data
- ✅ Click to view each person's conversations
- ✅ AI-powered analysis with one click
- ✅ Search conversations
- ✅ Export data to JSON
- ✅ Secure login (secret stored locally)

**To use the dashboard:**
- If using GitHub Pages: The dashboard will be at `https://your-username.github.io/Memoirs/admin.html`
- Or just open `admin.html` locally in your browser

## Setup

### 1. Set Admin Secret

In your Cloudflare Worker dashboard:
1. Go to your Worker → Settings → Variables
2. Add a new **Environment Variable**:
   - **Variable name**: `ADMIN_SECRET`
   - **Value**: Choose a strong secret key (e.g., `my-super-secret-key-2024`)
3. Save

**Important**: Keep this secret safe! Anyone with this key can access all data.

## Accessing Data

### Method 1: Direct API Calls

#### Get All Data
```
GET https://your-worker.workers.dev/admin/data?secret=YOUR_SECRET_KEY
```

#### Get Data for Specific Person
```
GET https://your-worker.workers.dev/admin/data?secret=YOUR_SECRET_KEY&personId=grandma
```

**Response includes:**
- All conversations
- All saved memories
- List of all people
- Statistics

#### Analyze a Person (AI-Powered)
```
POST https://your-worker.workers.dev/admin/analyze
Content-Type: application/json

{
  "secret": "YOUR_SECRET_KEY",
  "personId": "grandma"
}
```

**Response includes:**
- AI-generated summary
- Key topics and themes
- Personality traits
- Life events
- Relationships
- Values and beliefs
- Memorable stories

#### Query Conversations
```
POST https://your-worker.workers.dev/admin/query
Content-Type: application/json

{
  "secret": "YOUR_SECRET_KEY",
  "query": "childhood memories",
  "personId": "grandma"  // optional
}
```

### Method 2: Using curl

```bash
# Get all data
curl "https://your-worker.workers.dev/admin/data?secret=YOUR_SECRET_KEY"

# Analyze a person
curl -X POST "https://your-worker.workers.dev/admin/analyze" \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_SECRET_KEY", "personId": "grandma"}'

# Query conversations
curl -X POST "https://your-worker.workers.dev/admin/query" \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_SECRET_KEY", "query": "family stories"}'
```

### Method 3: Using JavaScript/Node.js

```javascript
const WORKER_URL = 'https://your-worker.workers.dev';
const SECRET = 'YOUR_SECRET_KEY';

// Get all data
async function getAllData() {
  const response = await fetch(`${WORKER_URL}/admin/data?secret=${SECRET}`);
  const data = await response.json();
  console.log(data);
}

// Analyze a person
async function analyzePerson(personId) {
  const response = await fetch(`${WORKER_URL}/admin/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, personId })
  });
  const analysis = await response.json();
  console.log(analysis);
}

// Query conversations
async function queryConversations(query, personId = null) {
  const response = await fetch(`${WORKER_URL}/admin/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, query, personId })
  });
  const results = await response.json();
  console.log(results);
}
```

## Data Export

### Export to JSON

You can save the API responses to JSON files:

```bash
# Export all data
curl "https://your-worker.workers.dev/admin/data?secret=YOUR_SECRET_KEY" > all_data.json

# Export analysis
curl -X POST "https://your-worker.workers.dev/admin/analyze" \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_SECRET_KEY", "personId": "grandma"}' > grandma_analysis.json
```

## Analysis Features

### AI-Powered Analysis

The `/admin/analyze` endpoint uses AI to generate:
- **Summary**: Brief overview of the person
- **Topics**: Key themes they discuss
- **Personality**: Traits and characteristics
- **Life Events**: Important events mentioned
- **Relationships**: Family and friends
- **Values**: Beliefs and principles
- **Stories**: Memorable anecdotes

### Query Examples

Search for specific information:
- `"childhood"` - Find all childhood-related conversations
- `"family"` - Find family discussions
- `"work"` - Find work/career conversations
- `"travel"` - Find travel stories
- `"marriage"` - Find marriage-related discussions

## Security Notes

1. **Never share your ADMIN_SECRET** - Anyone with it can access all data
2. **Use HTTPS** - All API calls should use HTTPS
3. **Rotate secrets** - Change your secret periodically
4. **Monitor access** - Check Cloudflare Worker logs for suspicious activity

## Privacy

- Regular users **cannot** access admin endpoints
- All admin endpoints require the secret key
- Users can only see their own conversations through the normal app
- Admin access is completely separate from user access

## Troubleshooting

### "Unauthorized" Error
- Check that `ADMIN_SECRET` is set in Cloudflare Worker environment variables
- Verify you're using the correct secret key
- Make sure the secret is passed correctly (URL parameter or request body)

### "No conversations found"
- Verify the personId is correct
- Check that conversations exist in the database
- Use `/admin/data` first to see all available people

### Analysis Not Working
- The AI analysis uses free Hugging Face API which may have rate limits
- If AI fails, a basic pattern-based analysis is returned
- Try again later if the API is temporarily unavailable

## Example Workflow

1. **Get list of all people:**
   ```
   GET /admin/data?secret=YOUR_SECRET
   ```

2. **Analyze each person:**
   ```
   POST /admin/analyze
   { "secret": "YOUR_SECRET", "personId": "grandma" }
   ```

3. **Query specific topics:**
   ```
   POST /admin/query
   { "secret": "YOUR_SECRET", "query": "childhood", "personId": "grandma" }
   ```

4. **Export data:**
   - Save API responses to JSON files
   - Use for backup or further analysis

