/**
 * Force sync emails from ordre@eltasolar.dk into incoming_emails table.
 * Standalone script — no Next.js server required.
 *
 * Usage: node scripts/force-sync-ordre.mjs
 */

import fs from 'fs';

// Load .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx > 0) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const TENANT_ID = env.AZURE_TENANT_ID;
const CLIENT_ID = env.AZURE_CLIENT_ID;
const CLIENT_SECRET = env.AZURE_CLIENT_SECRET;
const MAILBOX = env.GRAPH_MAILBOX || 'ordre@eltasolar.dk';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`\n=== Force Sync: ${MAILBOX} ===\n`);

// 1. Get OAuth token
console.log('1. Acquiring OAuth token...');
const tokenRes = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  }
);
const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
  console.error('Token error:', tokenData);
  process.exit(1);
}
const token = tokenData.access_token;
console.log('   OK — token acquired\n');

// 2. Check current sync state for this mailbox
console.log('2. Checking sync state for', MAILBOX);
const syncRes = await fetch(
  `${SUPABASE_URL}/rest/v1/graph_sync_state?mailbox=eq.${encodeURIComponent(MAILBOX)}&select=*`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
const syncRows = await syncRes.json();
const existingState = syncRows[0] || null;
console.log('   Existing state:', existingState ? `last sync ${existingState.last_sync_at}` : 'NONE (first sync for this mailbox)');

// Use delta link if we have one, otherwise initial fetch
const deltaLink = existingState?.delta_link || null;

// 3. Fetch from Graph
console.log('\n3. Fetching emails from Graph API...');
const graphUrl = deltaLink
  ? deltaLink
  : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/mailFolders/inbox/messages/delta?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead&$top=50&$orderby=receivedDateTime desc`;

const allMessages = [];
let currentUrl = graphUrl;
let newDeltaLink = null;
let page = 0;

while (currentUrl && page < 5) {
  const gRes = await fetch(currentUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="html"',
    },
  });

  if (!gRes.ok) {
    const errText = await gRes.text();
    console.error(`   Graph API error ${gRes.status}:`, errText.substring(0, 300));
    // If delta link is stale, retry without it
    if (deltaLink && page === 0) {
      console.log('   Retrying without delta link (initial fetch)...');
      currentUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/mailFolders/inbox/messages/delta?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead&$top=50&$orderby=receivedDateTime desc`;
      page++;
      continue;
    }
    break;
  }

  const gData = await gRes.json();
  allMessages.push(...(gData.value || []));

  if (gData['@odata.deltaLink']) {
    newDeltaLink = gData['@odata.deltaLink'];
    break;
  }
  if (gData['@odata.nextLink']) {
    currentUrl = gData['@odata.nextLink'];
    page++;
  } else {
    break;
  }
}

console.log(`   Fetched ${allMessages.length} messages from Graph`);
if (allMessages.length > 0) {
  for (const m of allMessages) {
    console.log(`   - "${m.subject}" from ${m.from?.emailAddress?.address} (${m.receivedDateTime})`);
  }
}

// 4. Insert into incoming_emails (skip duplicates)
console.log('\n4. Inserting into incoming_emails...');
let inserted = 0;
let skipped = 0;

for (const msg of allMessages) {
  // Check if already exists
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/incoming_emails?graph_message_id=eq.${encodeURIComponent(msg.id)}&select=id`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const existing = await checkRes.json();
  if (existing.length > 0) {
    console.log(`   SKIP (exists): "${msg.subject}"`);
    skipped++;
    continue;
  }

  // Insert
  const row = {
    graph_message_id: msg.id,
    conversation_id: msg.conversationId || null,
    subject: msg.subject || '(Intet emne)',
    sender_email: msg.from?.emailAddress?.address?.toLowerCase() || 'unknown',
    sender_name: msg.from?.emailAddress?.name || null,
    to_email: MAILBOX,
    cc: (msg.ccRecipients || []).map(r => r.emailAddress.address),
    reply_to: msg.replyTo?.[0]?.emailAddress?.address || null,
    body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
    body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
    body_preview: msg.bodyPreview ? msg.bodyPreview.substring(0, 200) : null,
    has_attachments: msg.hasAttachments || false,
    is_read: msg.isRead || false,
    received_at: msg.receivedDateTime,
    link_status: 'pending',
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/incoming_emails`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  if (insertRes.ok) {
    const insertData = await insertRes.json();
    console.log(`   INSERT OK: "${msg.subject}" → id=${insertData[0]?.id}`);
    inserted++;
  } else {
    const errText = await insertRes.text();
    console.error(`   INSERT FAIL: "${msg.subject}" — ${errText.substring(0, 200)}`);
  }
}

console.log(`\n   Inserted: ${inserted}, Skipped: ${skipped}`);

// 5. Upsert sync state
console.log('\n5. Updating sync state...');
const syncPayload = {
  mailbox: MAILBOX,
  last_sync_at: new Date().toISOString(),
  last_sync_status: 'success',
  last_sync_error: null,
  emails_synced_total: (existingState?.emails_synced_total || 0) + inserted,
};
if (newDeltaLink) syncPayload.delta_link = newDeltaLink;

const upsertRes = await fetch(
  `${SUPABASE_URL}/rest/v1/graph_sync_state?on_conflict=mailbox`,
  {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(syncPayload),
  }
);
console.log('   Upsert status:', upsertRes.status, upsertRes.ok ? 'OK' : await upsertRes.text());

// 6. Verify
console.log('\n6. Verifying — all non-archived emails:');
const verifyRes = await fetch(
  `${SUPABASE_URL}/rest/v1/incoming_emails?is_archived=eq.false&select=id,subject,sender_email,received_at,link_status&order=received_at.desc&limit=10`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
const allEmails = await verifyRes.json();
for (const e of allEmails) {
  console.log(`   [${e.link_status}] "${e.subject}" from ${e.sender_email} (${e.received_at})`);
}

console.log(`\n=== Done. Total visible emails: ${allEmails.length} ===\n`);
