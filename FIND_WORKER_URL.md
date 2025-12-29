# How to Find Your Cloudflare Worker URL

## Quick Steps:

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com
2. **Click "Workers & Pages"** in the left sidebar
3. **Click on your worker**: `grandma-memory-worker`
4. **Copy the URL** - it will look like:
   ```
   https://grandma-memory-worker.YOUR_SUBDOMAIN.workers.dev
   ```
   or
   ```
   https://grandma-memory-worker.YOUR_ACCOUNT.workers.dev
   ```

5. **Update `conversation.html`**:
   - Find the line: `const WORKER_URL = ...`
   - Replace `YOUR_SUBDOMAIN` with your actual URL

## Alternative: Check GitHub Actions Logs

1. Go to your GitHub repository
2. Click "Actions" tab
3. Open the latest workflow run
4. Look for the deployment step output
5. The worker URL will be shown there

## After Finding URL:

Update `conversation.html` line ~200:
```javascript
const WORKER_URL = 'https://grandma-memory-worker.YOUR_ACTUAL_URL.workers.dev';
```

Then commit and push - your site will work! ✅

