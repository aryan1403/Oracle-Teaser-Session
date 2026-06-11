import { fork } from 'child_process';

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Helper: Wait MS
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('================================================================');
  console.log('OCI TECHNICAL SIMULATION LIBRARY - CLI AUTOMATED TEST RUNNER');
  console.log('================================================================\n');

  // 1. Reset state
  console.log('[Setup] Resetting simulation engine state...');
  let res = await fetch(`${BASE_URL}/api/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Reset failed');
  console.log('[Setup] Simulation engine reset successful.\n');

  // =================================================================
  // EXERCISE 1: Non-Blocking Event Ingestion & Message Ordering
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('EXERCISE 1: Non-Blocking Gateway Ingestion & Key-Partitioning');
  console.log('----------------------------------------------------------------');
  
  console.log('[Ingestion] Firing 5 concurrent debit events for ACC-1001 (Alpha Corp)...');
  const acc1Promises = Array.from({ length: 5 }, (_, i) => {
    const payload = {
      accountId: 'ACC-1001',
      amount: 100.00 + (i * 5),
      type: 'DEBIT',
      routingCode: 'RT-9827',
      timestamp: Date.now()
    };
    return fetch(`${BASE_URL}/api/stream/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  });

  console.log('[Ingestion] Firing 5 concurrent credit events for ACC-1002 (Beta Industries)...');
  const acc2Promises = Array.from({ length: 5 }, (_, i) => {
    const payload = {
      accountId: 'ACC-1002',
      amount: 250.00 + (i * 10),
      type: 'CREDIT',
      routingCode: 'RT-9827',
      timestamp: Date.now()
    };
    return fetch(`${BASE_URL}/api/stream/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  });

  const results = await Promise.all([...acc1Promises, ...acc2Promises]);
  console.log(`[Ingestion] Received ${results.length} immediate HTTP 202 Ingestion Acknowledgements.`);

  // Fetch state to verify partitioning
  res = await fetch(`${BASE_URL}/api/state`);
  let state = await res.json();

  console.log('\n[Partition Audit] Reviewing Stream Log Partitions:');
  const pStream = state.streams['transaction-stream'];
  pStream.forEach((partitionMsgs, idx) => {
    console.log(`  Partition ${idx}: Contains ${partitionMsgs.length} messages`);
    partitionMsgs.forEach(msg => {
      console.log(`    - ID: ${msg.eventId} | Account: ${msg.payload.accountId} | Seq: ${msg.sequenceNumber} | Ingested At: ${msg.ingestedAt}`);
    });
  });

  // Verify key pinning
  const acc1Partitions = pStream.flatMap((p, idx) => p.map(m => ({m, idx}))).filter(x => x.m.payload.accountId === 'ACC-1001').map(x => x.idx);
  const acc2Partitions = pStream.flatMap((p, idx) => p.map(m => ({m, idx}))).filter(x => x.m.payload.accountId === 'ACC-1002').map(x => x.idx);
  
  const allAcc1Same = acc1Partitions.every(p => p === acc1Partitions[0]);
  const allAcc2Same = acc2Partitions.every(p => p === acc2Partitions[0]);

  console.log('\n[Verification Summary - Exercise 1]');
  if (allAcc1Same && allAcc2Same) {
    console.log('  ✔ PASS: Strict Account-to-Partition pinning verified (Deterministic Order).');
  } else {
    console.log('  ❌ FAIL: Events of same account routed to different partitions!');
  }
  console.log('----------------------------------------------------------------\n');

  // =================================================================
  // EXERCISE 2: Transactional Outbox Pattern & CDC Flow
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('EXERCISE 2: Transactional Outbox vs Dual-Write Database Atomicity');
  console.log('----------------------------------------------------------------');

  // Step 2.1: Test Dual-Write with stream OFFLINE (Should Rollback DB Transaction)
  console.log('[Dual-Write Test] Disconnecting streaming service...');
  await fetch(`${BASE_URL}/api/stream/toggle`, { method: 'POST' }); // Set offline

  console.log('[Dual-Write Test] Attempting direct publish DEBIT of $1000.00 from ACC-1001...');
  res = await fetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-1001', amount: 1000.00, type: 'DEBIT', mode: 'dual_write' })
  });
  
  let txResult = await res.json();
  console.log(`[Dual-Write Test] Server Response status: ${res.status}. Error details: ${txResult.error}`);

  // Fetch balance to verify rollback
  res = await fetch(`${BASE_URL}/api/state`);
  state = await res.json();
  console.log(`[Dual-Write Test] Account ACC-1001 Ledger Balance: $${state.ledger['ACC-1001'].balance} (Expected: $5000.00)`);
  
  const dualWritePass = state.ledger['ACC-1001'].balance === 5000.00;

  // Step 2.2: Test Transactional Outbox with stream OFFLINE (Should Commit DB, CDC queue rows)
  console.log('\n[Outbox Test] Attempting Transactional Outbox DEBIT of $500.00 from ACC-1001...');
  res = await fetch(`${BASE_URL}/api/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-1001', amount: 500.00, type: 'DEBIT', mode: 'outbox' })
  });

  txResult = await res.json();
  console.log(`[Outbox Test] Server Response status: ${res.status}. Outbox entry ID: ${txResult.outboxEntry.id}, status: ${txResult.outboxEntry.status}`);

  // Verify DB updated balance but CDC relay is pending
  res = await fetch(`${BASE_URL}/api/state`);
  state = await res.json();
  console.log(`[Outbox Test] Account ACC-1001 Ledger Balance: $${state.ledger['ACC-1001'].balance} (Expected: $4500.00)`);
  console.log(`[Outbox Test] Total outbox table size: ${state.outbox.length}. Pending rows: ${state.outbox.filter(r => r.status === 'PENDING').length}`);

  const outboxDbgPass = state.ledger['ACC-1001'].balance === 4500.00 && state.outbox.filter(r => r.status === 'PENDING').length === 1;

  // Step 2.3: Reconnect Stream and verify CDC delivery
  console.log('\n[Outbox Test] Reconnecting streaming service. Waiting for CDC polling agent relay...');
  await fetch(`${BASE_URL}/api/stream/toggle`, { method: 'POST' }); // Set online
  await wait(1500); // Wait for CDC daemon cycle

  res = await fetch(`${BASE_URL}/api/state`);
  state = await res.json();
  console.log(`[Outbox Test] Total outbox table size: ${state.outbox.length}. Pending rows: ${state.outbox.filter(r => r.status === 'PENDING').length}`);
  console.log(`[Outbox Test] CDC Relayed log count: ${state.cdcRelayHistory.length}`);

  const cdcRelayPass = state.outbox.filter(r => r.status === 'PENDING').length === 0 && state.cdcRelayHistory.length > 0;

  console.log('\n[Verification Summary - Exercise 2]');
  if (dualWritePass && outboxDbgPass && cdcRelayPass) {
    console.log('  ✔ PASS: Atomicity verified. Dual-write rollback & Transactional Outbox async CDC delivery completed successfully.');
  } else {
    console.log('  ❌ FAIL: State divergence detected.');
  }
  console.log('----------------------------------------------------------------\n');

  // =================================================================
  // EXERCISE 3: Advanced Pipeline Resilience - Poison Pills & DLQ
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('EXERCISE 3: Fraud screening Consumer Engine & DLQ Isolation');
  console.log('----------------------------------------------------------------');

  console.log('[Chaos Ingestion] Sending clean standard transaction first...');
  await fetch(`${BASE_URL}/api/stream/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-1002', amount: 50.00, routingCode: 'RT-9827', timestamp: Date.now() })
  });

  console.log('[Chaos Ingestion] Injecting Poison Pill Type A: Malformed JSON...');
  await fetch(`${BASE_URL}/api/stream/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: "{\"accountId\": \"ACC-1002\", \"amount\": 250.00, \"routingCode\": \"RT-CORRUPTED-\x00\x01\"" // unclosed JSON
  });

  console.log('[Chaos Ingestion] Injecting Poison Pill Type B: Missing Routing Key...');
  await fetch(`${BASE_URL}/api/stream/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-1002', amount: 150.00 }) // missing routingCode
  });

  console.log('[Chaos Ingestion] Injecting Poison Pill Type C: Negative value...');
  await fetch(`${BASE_URL}/api/stream/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-1002', amount: -25.00, routingCode: 'RT-8812' }) // negative amount
  });

  console.log('[Chaos Ingestion] Injecting Poison Pill Type D: Blacklisted account ID...');
  await fetch(`${BASE_URL}/api/stream/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-CHAOS-VOID', amount: 2000.00, routingCode: 'RT-VOID99' }) // blacklisted account
  });

  console.log('[Chaos Ingestion] Sending trailing clean standard transaction...');
  await fetch(`${BASE_URL}/api/stream/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId: 'ACC-1002', amount: 80.00, routingCode: 'RT-9827', timestamp: Date.now() })
  });

  console.log('[Chaos Ingestion] Waiting for Consumer Fraud Screening loop to process messages...');
  await wait(1000);

  // Fetch final metrics
  res = await fetch(`${BASE_URL}/api/state`);
  state = await res.json();

  console.log(`\n[Pipeline Telemetry Dashboard]`);
  console.log(`  Total Messages Ingested: ${state.metrics.totalIngestedCount}`);
  console.log(`  Clean Processed: ${state.metrics.cleanProcessedCount}`);
  console.log(`  DLQ Isolated: ${state.metrics.dlqCount}`);

  console.log('\n[DLQ Partition Audit] Reviewing isolated poison pill records:');
  state.streams['dlq-stream'].forEach((dlqRecord, idx) => {
    console.log(`  Isolation Index ${idx}:`);
    console.log(`    - Isolated At: ${new Date(dlqRecord.payload.isolatedAt).toISOString()}`);
    console.log(`    - Reason: ${dlqRecord.payload.errorReason}`);
    console.log(`    - Exception Type: ${dlqRecord.payload.exceptionClass}`);
    console.log(`    - Handled By Node: ${dlqRecord.payload.consumerNodeId}`);
  });

  const dlqSuccess = state.metrics.dlqCount === 4;

  console.log('\n[Verification Summary - Exercise 3]');
  if (dlqSuccess) {
    console.log('  ✔ PASS: Chaos isolated successfully. Dead Letter Queue caught all 4 poison pills. Consumer thread remains healthy.');
  } else {
    console.log(`  ❌ FAIL: DLQ size is ${state.metrics.dlqCount} instead of 4.`);
  }
  console.log('================================================================');

  if (allAcc1Same && allAcc2Same && dualWritePass && outboxDbgPass && cdcRelayPass && dlqSuccess) {
    return true;
  }
  return false;
}

// Smart Server Discovery & Spawning
let server = null;
let shouldKillServer = false;

try {
  const checkRes = await fetch(`${BASE_URL}/api/state`);
  if (checkRes.ok) {
    console.log('[Server Discovery] Existing simulator instance detected on port 3000. Running tests against active instance...');
  } else {
    throw new Error('Not OK');
  }
} catch (e) {
  console.log('[Server Startup] Spawning simulator background process on port 3000...');
  server = fork('./server.js', { silent: true });
  shouldKillServer = true;

  // Capture server output logs and print them prefixed
  server.stdout.on('data', (data) => {
    console.log(`[Server Console] ${data.toString().trim()}`);
  });

  server.stderr.on('data', (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  // Wait/Poll for server to start up
  let connected = false;
  for (let i = 0; i < 10; i++) {
    await wait(500);
    try {
      const res = await fetch(`${BASE_URL}/api/state`);
      if (res.ok) {
        connected = true;
        break;
      }
    } catch (err) {
      // Keep waiting
    }
  }
  if (!connected) {
    console.error('\nCRITICAL: Failed to connect to the spawned simulator server on port 3000.');
    if (server) server.kill();
    process.exit(1);
  }
}

try {
  const allPassed = await runTests();
  if (allPassed) {
    console.log('\nALL SYSTEM STATE VERIFICATIONS: COMPLETED WITH SUCCESS (100% PASS RATE).');
    if (shouldKillServer && server) server.kill();
    process.exit(0);
  } else {
    console.error('\nSTATE VERIFICATION FAILED: Test assertions did not match specifications.');
    if (shouldKillServer && server) server.kill();
    process.exit(1);
  }
} catch (err) {
  console.error('\nCRITICAL TEST ERROR:', err.message);
  if (shouldKillServer && server) server.kill();
  process.exit(1);
}
