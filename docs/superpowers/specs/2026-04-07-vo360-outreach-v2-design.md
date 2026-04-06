# VO360 Outreach V2 — Design Spec

## Overview

A Next.js web app for home remodeling lead outreach. Upload a CSV from BatchLeads, AI scores and writes personalized SMS messages, you review and approve, app sends via GoHighLevel.

**Target user:** VO360 team — non-technical, uses the web UI for everything.

**Business:** Home remodeling services. Reaching homeowners who may need kitchen, bath, flooring, paint, outdoor, or general remodeling work.

## Flow

1. **Upload** — Drag & drop a BatchLeads CSV export
2. **Dedup** — Check each lead's phone number against GHL contacts. Skip any that already exist (already contacted).
3. **Score** — Claude AI scores remaining leads 1-10 for remodeling potential
4. **Generate messages** — Claude writes a personalized SMS for each lead, following user-provided guidelines
5. **Review** — User sees all leads in a table, sorted by score. Can edit messages, select/deselect leads.
6. **Send** — Creates GHL contact + sends SMS for each selected lead
7. **Log** — All sends are recorded in a send log

## Pages

### 1. Upload Page (Home)

- Drag & drop zone for CSV file
- On upload: parse CSV, auto-map columns to internal fields
- Show preview: "Found X leads. Checking for duplicates..."
- After dedup: "X new leads, Y already contacted (skipped)"
- Button: "Score & Generate Messages" → navigates to Review page

**CSV column mapping:**
The app maps BatchLeads CSV columns to internal fields. Expected columns include:
- First Name, Last Name
- Phone (primary)
- Property Address, City, State, Zip
- Property Type
- Bedrooms, Bathrooms, Sqft
- Year Built
- Estimated Value, Equity %
- Owner Occupied (yes/no)
- Last Sale Date, Last Sale Price
- Absentee Owner, Free & Clear, etc.

Unmapped columns are ignored. Missing columns are treated as empty. The app handles variations in column naming (e.g., "First Name" vs "firstName" vs "first_name").

### 2. Review Page

**Controls at the top:**
- **Message Guidelines** — text area where the user types directions for the AI (tone, angle, offer, focus). If blank, defaults are used.
- **Link** — text input for a URL to include in messages (website, landing page, scheduling link). If blank, no link is added.
- **"Regenerate Messages"** button — re-runs AI message generation with updated guidelines/link
- **"Select All" / "Deselect All"** toggles

**Lead table columns:**
- Checkbox (select for sending)
- Score (1-10, color-coded: green 7-10, yellow 4-6, red 1-3)
- Score Reason (short AI explanation)
- Name
- Phone
- Address
- Key Property Info (year built, sqft, equity — compact)
- SMS Message (editable text field)
- Status (pending / already contacted)

Table is sorted by score descending (best leads first).

### 3. Send Page

- Shows progress: "Sending 15 of 23..."
- For each lead:
  1. Create contact in GHL (firstName, lastName, phone, address, tags: ["vo360-outreach"])
  2. Send SMS via GHL conversations API
  3. Record result
- On completion: summary — "23 sent, 0 failed"
- Button to view Send Log

### 4. Send Log Page

- Table: Date, Name, Phone, Address, Score, Message, Status (sent/failed/error message)
- Filter by date range
- Filter by status
- Export to CSV button

## AI Scoring Logic

Claude receives all lead data and scores each 1-10 for home remodeling potential.

**High score (7-10):**
- Older home (15+ years) — likely needs updates
- High equity — can afford remodeling
- Owner-occupied — lives there, cares about the home
- Long ownership — probably hasn't remodeled recently
- Larger home — more remodeling surface area

**Medium score (4-6):**
- 5-15 year old home
- Moderate equity
- Average characteristics

**Low score (1-3):**
- Recently sold — new owner likely already renovated or chose it as-is
- Corporate owned — not a homeowner
- Very low equity — can't afford remodeling
- Vacant — nobody lives there

**Output per lead:** score (integer 1-10) + reason (one sentence).

## AI Message Generation

Claude writes one personalized SMS per lead.

**Default style (no user guidelines):**
- Friendly, casual, like a local neighbor
- Use first name
- Mention their street or neighborhood
- Soft call to action ("reply here", "happy to chat", "free estimate")
- Never mention equity, property value, ownership length, or anything data-creepy
- Target under 160 characters when possible (1 SMS segment)

**User guidelines override:** When the user provides message guidelines, the AI follows those directions instead of (or in addition to) the defaults. Examples:
- "Mention spring discount on kitchens"
- "Focus on outdoor spaces"
- "Keep it super short"
- "We just finished a job in their area"

**Link field:** When provided, the AI naturally incorporates the URL into the message (e.g., "Check out our work at {link}" or "Book a free estimate: {link}").

## GHL Integration

**Sub-account:** Calispark Electric (location ID from .env)
**API key:** Sub-account key from .env

**Dedup check:**
- Search GHL contacts by phone number
- If found → skip lead, mark "Already contacted"
- If not found → include lead for scoring/messaging

**Contact creation:**
- POST to /contacts/ with firstName, lastName, phone (E.164), address fields
- Tag: `vo360-outreach`
- Source: `vo360-outreach-v2`

**SMS send:**
- POST to /conversations/messages with type: SMS, contactId, message body

## Data Storage

**SQLite database** (local file) for:
- Send log entries (date, lead info, score, message, GHL contact ID, send status)
- No lead data is persisted beyond the current session — CSV data lives in memory during the upload→review→send flow

## Tech Stack

- **Framework:** Next.js 15, App Router
- **Styling:** Tailwind CSS
- **Database:** SQLite via better-sqlite3 (send log only)
- **AI:** Anthropic Claude API (direct, using @anthropic-ai/sdk)
- **SMS:** GoHighLevel API
- **Deployment:** Local first, Vercel-ready

## Scope Boundaries

**In scope:**
- CSV upload + column mapping
- GHL dedup
- AI scoring
- AI message generation with custom guidelines and optional link
- Message review + edit
- Send via GHL
- Send log with export

**Out of scope (future):**
- Multi-channel (email, voicemail drops)
- Auto follow-up sequences
- Response tracking / conversation view
- Multiple sub-accounts / businesses
- BatchData API integration
- User authentication
