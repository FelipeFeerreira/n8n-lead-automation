/**
 * Local dependency-free simulator for the lead-inbound n8n workflow.
 * No n8n server is required. Providers are mocked in-process.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_ID = randomUUID().slice(0, 8);
const logs = [];

function now() {
  return new Date().toISOString();
}

function log(step, status, latencyMs, payload, note = '') {
  const entry = {
    timestamp: now(),
    runId: RUN_ID,
    step,
    status,
    latencyMs,
    payload: truncate(payload),
    note,
  };
  logs.push(entry);
  console.log(JSON.stringify(entry));
}

function truncate(value, max = 280) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeLatency() {
  // Simulated network/provider latency 20-120 ms
  return 20 + Math.floor(Math.random() * 100);
}

// ------------------------------------------------------------------
// Mock providers
// ------------------------------------------------------------------

async function sendEmail(payload) {
  const latency = makeLatency();
  await sleep(latency);
  // Fake provider "response"
  return {
    ok: true,
    provider: 'fake-smtp',
    messageId: `msg_${randomUUID().slice(0, 8)}`,
    to: payload.email,
    latency,
  };
}

async function sendWhatsApp(payload, attempt = 1) {
  const latency = makeLatency();
  await sleep(latency);

  const shouldFail = process.env.SIM_WHATSAPP_FAIL === 'true';
  if (shouldFail) {
    const err = new Error(`WhatsApp API returned 500 (attempt ${attempt})`);
    err.code = 'WHATSAPP_PROVIDER_ERROR';
    err.latency = latency;
    throw err;
  }

  return {
    ok: true,
    provider: 'fake-whatsapp-api',
    messageId: `wa_${randomUUID().slice(0, 8)}`,
    phone: payload.phone,
    latency,
  };
}

async function createCrmRecord(payload) {
  const latency = makeLatency();
  await sleep(latency);
  return {
    ok: true,
    provider: 'fake-crm',
    recordId: `crm_${randomUUID().slice(0, 8)}`,
    email: payload.email,
    latency,
  };
}

// ------------------------------------------------------------------
// Workflow steps
// ------------------------------------------------------------------

function validateFields(input) {
  const start = performance.now();
  const required = ['name', 'email', 'phone', 'source'];
  const missing = required.filter((f) => !input[f]);
  if (missing.length) {
    const err = new Error(`Validation failed: missing ${missing.join(', ')}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const latency = Math.round(performance.now() - start);
  const out = { ...input, validatedAt: now() };
  log('validate-fields', 'success', latency, out);
  return out;
}

async function runConfirmationEmail(lead) {
  const start = performance.now();
  const result = await sendEmail({
    to: lead.email,
    subject: 'We received your request',
    text: `Hi ${lead.name},\n\nThanks for reaching out. We will contact you soon.\n\nSource: ${lead.source}`,
  });
  const latency = Math.round(performance.now() - start);
  log('send-confirmation-email', 'success', latency, result);
  return result;
}

async function runWhatsAppWithRetry(lead, maxTries = 3, waitBetweenTries = 200) {
  let lastError;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const start = performance.now();
    try {
      const result = await sendWhatsApp(lead, attempt);
      const latency = Math.round(performance.now() - start);
      log('notify-whatsapp', 'success', latency, result, `attempt ${attempt}`);
      return { ok: true, result };
    } catch (err) {
      const latency = Math.round(performance.now() - start);
      lastError = err;
      log(
        'notify-whatsapp',
        'error',
        latency,
        { code: err.code, message: err.message },
        `attempt ${attempt} failed`
      );
      if (attempt < maxTries) {
        log('notify-whatsapp', 'retry', 0, { waitMs: waitBetweenTries }, `attempt ${attempt}`);
        await sleep(waitBetweenTries);
      }
    }
  }
  return { ok: false, error: lastError };
}

async function runFallbackEmail(lead, reason) {
  const start = performance.now();
  const result = await sendEmail({
    to: lead.email,
    subject: 'Follow-up: we are still here',
    text: `Hi ${lead.name},\n\nWe could not reach you via WhatsApp (${reason}), so we are following up by email.`,
  });
  const latency = Math.round(performance.now() - start);
  log('fallback-email', 'success', latency, result, 'WhatsApp failure fallback');
  return result;
}

async function runCrmRecord(lead) {
  const start = performance.now();
  const result = await createCrmRecord(lead);
  const latency = Math.round(performance.now() - start);
  log('create-crm-record', 'success', latency, result);
  return result;
}

function logExecution(lead, whatsAppOk) {
  const start = performance.now();
  const entry = {
    runAt: now(),
    workflow: 'lead-inbound',
    status: whatsAppOk ? 'success' : 'partial-success',
    leadEmail: lead.email,
    source: lead.source,
    runId: RUN_ID,
  };
  const latency = Math.round(performance.now() - start);
  log('log-execution', 'success', latency, entry);
  return entry;
}

// ------------------------------------------------------------------
// Load webhook payload from workflow "pinData" or use default sample
// ------------------------------------------------------------------

function loadSamplePayload() {
  try {
    const workflowPath = resolve(__dirname, '../workflows/lead-inbound.json');
    const raw = readFileSync(workflowPath, 'utf8');
    JSON.parse(raw); // ensure valid JSON
    // We do not rely on pinData in this simulator; use a deterministic sample.
  } catch {
    // ignore
  }

  return {
    name: 'Felipe Sample',
    email: 'felipe.sample@example.com',
    phone: '+5511999999999',
    source: 'landing-page',
  };
}

// ------------------------------------------------------------------
// Main runner
// ------------------------------------------------------------------

async function main() {
  console.log(`\n=== n8n lead-inbound simulator (run ${RUN_ID}) ===\n`);

  const payload = loadSamplePayload();
  log('webhook-received', 'success', 0, payload);

  let lead;
  try {
    lead = validateFields(payload);
  } catch (err) {
    log('workflow', 'failed', 0, { error: err.message, code: err.code });
    console.error('\nWorkflow failed:', err.message);
    process.exitCode = 1;
    return;
  }

  await runConfirmationEmail(lead);

  const whatsAppOutcome = await runWhatsAppWithRetry(lead, 3, 200);
  let whatsAppOk = whatsAppOutcome.ok;

  if (!whatsAppOk) {
    await runFallbackEmail(lead, whatsAppOutcome.error.code);
    // Mark as partial success because email fallback delivered.
    whatsAppOk = false;
  }

  await runCrmRecord(lead);
  logExecution(lead, whatsAppOk);

  const summary = {
    runId: RUN_ID,
    finalStatus: whatsAppOk ? 'success' : 'partial-success',
    totalSteps: logs.length,
    whatsAppFailed: !whatsAppOk,
  };
  console.log(`\n=== summary ===\n${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  console.error('Unexpected simulator error:', err);
  process.exitCode = 1;
});
