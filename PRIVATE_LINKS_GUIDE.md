# Private Invite Links Guide

## How Private Links Work

Each family member gets their own unique link that:
- ✅ Automatically identifies them (no need to enter name)
- ✅ Loads their conversation history automatically
- ✅ Continues where they left off
- ✅ Is completely private (they can't see other people's data)

## Creating Private Links

### Format:
```
https://maazahmed2000-max.github.io/Memoirs/?person=PERSON_ID&name=PERSON_NAME
```

### Examples:

**For Grandma:**
```
https://maazahmed2000-max.github.io/Memoirs/?person=grandma&name=Grandma
```

**For Mom:**
```
https://maazahmed2000-max.github.io/Memoirs/?person=mom&name=Mom
```

**For Dad:**
```
https://maazahmed2000-max.github.io/Memoirs/?person=dad&name=Dad
```

**For Uncle:**
```
https://maazahmed2000-max.github.io/Memoirs/?person=uncle-ahmed&name=Uncle Ahmed
```

## How to Generate Links

### Option 1: Manual (Simple)
Just replace `PERSON_ID` and `PERSON_NAME` in the URL:
- `PERSON_ID`: lowercase, use hyphens for spaces (e.g., "grandma", "mom", "uncle-ahmed")
- `PERSON_NAME`: The display name (e.g., "Grandma", "Mom", "Uncle Ahmed")

### Option 2: Use a Link Generator (Future)
You could create a simple page that generates these links, but for now, manual works fine.

## What Happens When They Open the Link

1. **Person is automatically identified** - No need to enter name
2. **Person selector is hidden** - Cleaner interface
3. **Their conversation history loads** - Continues where they left off
4. **URL is updated** - They can bookmark it for easy access
5. **Completely private** - They only see their own conversations

## Privacy Features

- ✅ Each link is unique to that person
- ✅ No one can see who else has links
- ✅ No one can access another person's data
- ✅ Links don't reveal other users
- ✅ Each person's data is completely isolated

## Sharing Links

**Safe to share via:**
- WhatsApp message
- Email
- Text message
- Any private communication

**Each person gets:**
- Their own unique link
- Their own memory bank
- Their own conversation history
- Complete privacy

## Example Workflow

1. **You create links:**
   - Grandma: `https://maazahmed2000-max.github.io/Memoirs/?person=grandma&name=Grandma`
   - Mom: `https://maazahmed2000-max.github.io/Memoirs/?person=mom&name=Mom`

2. **Send via WhatsApp:**
   - "Grandma, here's your link to share your stories: [link]"
   - "Mom, here's your link: [link]"

3. **They open the link:**
   - Automatically identified
   - Their history loads
   - They can start chatting immediately

4. **They bookmark it:**
   - The URL includes their identity
   - Next time they open it, everything loads automatically

## Tips

- **Use simple IDs**: `grandma`, `mom`, `dad` (lowercase, no spaces)
- **Use readable names**: "Grandma", "Mom", "Dad" (for display)
- **Test the link first**: Open it yourself to make sure it works
- **Send via private message**: Keep links private

## Technical Details

- Person ID is stored in URL parameter: `?person=grandma`
- Person name is stored in URL parameter: `?name=Grandma`
- Both are saved to localStorage for persistence
- URL is updated when person is set
- History loads automatically based on person_id

