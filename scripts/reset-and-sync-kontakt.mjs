/**
 * Reset delta + force full sync for kontakt@eltasolar.dk.
 *
 * 1. Nulls delta_link in graph_sync_state for the mailbox
 * 2. Resets emails_synced_total to 0
 * 3. Performs a fresh delta fetch (no deltaLink → initial baseline)
 * 4. Inserts new emails into incoming_emails (skips duplicates)
 * 5. Stores the new deltaLink for next incremental sync
 *
 * Usage: node scripts/reset-and-sync-kontakt.mjs
 */

import fs from 'fs';

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
const MAILBOX = 'kontakt@eltasolar.dk';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`\n=== Reset + Full Sync: ${MAILBOX} ===\n`);

// 0. Inspect current state
console.log('0. Current graph_sync_state row:');
const beforeRes = await fetch(
  `${SUPABASE_URL}/rest/v1/graph_sync_state?mailbox=eq.${encodeURIComponent(MAILBOX)}&select=*`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
const beforeRows = await beforeRes.json();
const before = beforeRows[0] || null;
if (before) {
  console.log(`   delta_link: ${before.delta_link ? before.delta_link.substring(0, 80) + '...' : 'NULL'}`);
  console.log(`   last_sync_at: ${before.last_sync_at}`);
  console.log(`   last_sync_status: ${before.last_sync_status}`);
  console.log(`   emails_synced_total: ${before.emails_synced_total}`);
} else {
  console.log('   (no row exists yet)');
}

// 1. Reset delta_link + counter
console.log('\n1. Resetting delta_link and counter...');
const resetPayload = {
  mailbox: MAILBOX,
  delta_link: null,
  emails_synced_total: 0,
  last_sync_status: 'never',
  last_sync_error: null,
};
const resetRes = await fetch(
  `${SUPABASE_URL}/rest/v1/graph_sync_state?on_conflict=mailbox`,
  {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(resetPayload),
  }
);
if (!resetRes.ok) {
  console.error('   Reset failed:', resetRes.status, await resetRes.text());
  process.exit(1);
}
console.log('   OK — delta_link cleared, emails_synced_total = 0');

// 2. OAuth token
console.log('\n2. Acquiring OAuth token...');
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
  console.error('   Token error:', tokenData);
  process.exit(1);
}
const token = tokenData.access_token;
console.log('   OK');

// 3. Full delta fetch (no deltaLink → baseline)
console.log('\n3. Full delta fetch from Graph (paging up to 20 pages)...');
const initialUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/mailFolders/inbox/messages/delta?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead&$top=50&$orderby=receivedDateTime desc`;

const allMessages = [];
let currentUrl = initialUrl;
let newDeltaLink = null;
let page = 0;

while (currentUrl && page < 20) {
  const gRes = await fetch(currentUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="html"',
    },
  });
  if (!gRes.ok) {
    console.error(`   Graph API error ${gRes.status}:`, (await gRes.text()).substring(0, 300));
    break;
  }
  const gData = await gRes.json();
  allMessages.push(...(gData.value || []));
  page++;
  console.log(`   Page ${page}: +${gData.value?.length || 0} messages (total ${allMessages.length})`);

  if (gData['@odata.deltaLink']) {
    newDeltaLink = gData['@odata.deltaLink'];
    break;
  }
  if (gData['@odata.nextLink']) {
    currentUrl = gData['@odata.nextLink'];
  } else {
    break;
  }
}
console.log(`   Done — ${allMessages.length} messages fetched, deltaLink ${newDeltaLink ? 'received' : 'MISSING'}`);

// 4. Insert (skip duplicates)
console.log('\n4. Inserting into incoming_emails...');
let inserted = 0;
let skipped = 0;
let failed = 0;

for (const msg of allMessages) {
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/incoming_emails?graph_message_id=eq.${encodeURIComponent(msg.id)}&select=id`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const existing = await checkRes.json();
  if (existing.length > 0) {
    skipped++;
    continue;
  }

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
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (insertRes.ok) {
    inserted++;
  } else {
    failed++;
    if (failed <= 3) {
      console.error(`   INSERT FAIL "${msg.subject}": ${(await insertRes.text()).substring(0, 200)}`);
    }
  }
}
console.log(`   Inserted: ${inserted}, Skipped (duplicate): ${skipped}, Failed: ${failed}`);

// 5. Persist new delta_link + final state
console.log('\n5. Updating graph_sync_state with new delta_link...');
const finalPayload = {
  mailbox: MAILBOX,
  delta_link: newDeltaLink,
  last_sync_at: new Date().toISOString(),
  last_sync_status: newDeltaLink ? 'success' : 'failed',
  last_sync_error: newDeltaLink ? null : 'No deltaLink returned after full sync',
  emails_synced_total: inserted,
};
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
    body: JSON.stringify(finalPayload),
  }
);
console.log('   Status:', upsertRes.status, upsertRes.ok ? 'OK' : await upsertRes.text());

// 6. Verify
console.log('\n6. Final state:');
const afterRes = await fetch(
  `${SUPABASE_URL}/rest/v1/graph_sync_state?mailbox=eq.${encodeURIComponent(MAILBOX)}&select=*`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
const after = (await afterRes.json())[0];
console.log(`   delta_link: ${after?.delta_link ? 'SET (' + after.delta_link.substring(0, 60) + '...)' : 'NULL'}`);
console.log(`   last_sync_at: ${after?.last_sync_at}`);
console.log(`   last_sync_status: ${after?.last_sync_status}`);
console.log(`   emails_synced_total: ${after?.emails_synced_total}`);

console.log(`\n=== Done. ${inserted} new emails imported for ${MAILBOX} ===\n`);
