/**
 * Backfill attachments for emails that have has_attachments=true
 * but no stored attachment URLs (e.g. synced via force-sync script).
 *
 * Usage: node scripts/backfill-attachments.mjs
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

console.log('\n=== Backfill Attachments ===\n');

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
console.log('   OK\n');

// 2. Find emails with has_attachments=true but empty/missing attachment_urls
console.log('2. Finding emails needing attachment backfill...');
const emailsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/incoming_emails?has_attachments=eq.true&select=id,graph_message_id,subject,attachment_urls`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
const allEmails = await emailsRes.json();

const needsBackfill = allEmails.filter((e) => {
  const urls = e.attachment_urls || [];
  return urls.length === 0 || !urls.some((u) => u.url && u.url.length > 0);
});

console.log(`   Total with attachments: ${allEmails.length}`);
console.log(`   Needs backfill: ${needsBackfill.length}\n`);

if (needsBackfill.length === 0) {
  console.log('Nothing to backfill!\n');
  process.exit(0);
}

// 3. For each email, fetch attachments from Graph and store in Supabase Storage
let success = 0;
let failed = 0;

for (const email of needsBackfill) {
  console.log(`\n   Processing: "${email.subject}" (${email.id})`);

  try {
    // Fetch attachments for this message (separate endpoint returns contentBytes)
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/messages/${email.graph_message_id}/attachments`;

    const msgRes = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!msgRes.ok) {
      console.error(`   Graph error ${msgRes.status}: ${(await msgRes.text()).substring(0, 200)}`);
      failed++;
      continue;
    }

    const msgData = await msgRes.json();
    const attachments = (msgData.value || []).filter(
      (a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && a.contentBytes
    );

    if (attachments.length === 0) {
      console.log('   No file attachments found');
      continue;
    }

    console.log(`   Found ${attachments.length} attachment(s)`);

    const storedUrls = [];

    for (const att of attachments) {
      const safeName = att.name
        .replace(/[^a-zA-Z0-9._\-\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 200);
      const storagePath = `email-attachments/${email.id}/${safeName}`;

      // Decode base64 to buffer
      const buffer = Buffer.from(att.contentBytes, 'base64');

      // Upload to Supabase Storage
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/attachments/${storagePath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': att.contentType || 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: buffer,
        }
      );

      if (!uploadRes.ok) {
        console.error(`   Upload failed for ${att.name}: ${(await uploadRes.text()).substring(0, 200)}`);
        continue;
      }

      // Get public URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/attachments/${storagePath}`;

      storedUrls.push({
        filename: att.name,
        contentType: att.contentType || 'application/octet-stream',
        size: att.size,
        url: publicUrl,
        storagePath,
      });

      console.log(`   Stored: ${att.name} (${(att.size / 1024).toFixed(1)} KB)`);
    }

    // Update email record with attachment URLs
    if (storedUrls.length > 0) {
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/incoming_emails?id=eq.${email.id}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ attachment_urls: storedUrls }),
        }
      );

      if (updateRes.ok) {
        console.log(`   Updated DB record with ${storedUrls.length} attachment URL(s)`);
        success++;
      } else {
        console.error(`   DB update failed: ${(await updateRes.text()).substring(0, 200)}`);
        failed++;
      }
    }
  } catch (err) {
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

console.log(`\n=== Done. Success: ${success}, Failed: ${failed} ===\n`);
