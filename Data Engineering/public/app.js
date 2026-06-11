// Telemetry logs helpers
function logToScreen(elementId, message, type = 'info') {
  const logScreen = document.getElementById(elementId);
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry-line ${type}`;
  entry.innerHTML = `<span class="val-muted">[${time}]</span> ${message}`;
  
  logScreen.appendChild(entry);
  logScreen.scrollTop = logScreen.scrollHeight;

  // Limit log lines to 30
  while (logScreen.childNodes.length > 30) {
    logScreen.removeChild(logScreen.firstChild);
  }
}

// State variables
let currentStreamOnline = true;
let prevOutboxCount = 0;

// Fetch and render system state
async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const state = await res.json();
    
    updateStreamBadge(state.streamEngineOnline);
    updateLedgerTable(state.ledger);
    updateOutboxTable(state.outbox);
    updatePartitions(state.streams['transaction-stream']);
    updateMetrics(state.metrics);
    updateDlqTable(state.streams['dlq-stream']);
    updateCdcStatus(state);
  } catch (err) {
    console.error('Error fetching simulator state:', err);
  }
}

// Toggle Broker connection
async function toggleStreamConnection() {
  try {
    const res = await fetch('/api/stream/toggle', { method: 'POST' });
    const data = await res.json();
    
    logToScreen('ex1-telemetry', `Stream broker connection changed: ${data.streamEngineOnline ? 'ONLINE' : 'OFFLINE'}`, data.streamEngineOnline ? 'success' : 'warn');
  } catch (err) {
    console.error(err);
  }
}

// Update Broker UI Elements
function updateStreamBadge(online) {
  currentStreamOnline = online;
  const btn = document.getElementById('btn-toggle-stream');
  const dot = document.getElementById('stream-status-dot');
  const txt = document.getElementById('stream-status-text');
  
  if (online) {
    btn.className = 'btn btn-status-online';
    dot.className = 'status-indicator online';
    txt.innerText = 'ONLINE';
  } else {
    btn.className = 'btn btn-status-offline';
    dot.className = 'status-indicator offline';
    txt.innerText = 'OFFLINE';
  }
}

// Reset System
async function resetSystem() {
  try {
    await fetch('/api/reset', { method: 'POST' });
    document.getElementById('ex1-telemetry').innerHTML = '[System Log] State resets successful. Ready.';
    document.getElementById('cdc-telemetry').innerHTML = '[CDC Agent] Initializing outbox tail log reader...';
    logToScreen('ex1-telemetry', 'All ledger accounts, outboxes, streams, and DLQ stores cleared.', 'info');
  } catch (err) {
    console.error(err);
  }
}

// Render ledger
function updateLedgerTable(ledgerData) {
  const tbody = document.querySelector('#table-ledger tbody');
  tbody.innerHTML = '';
  for (const [accId, data] of Object.entries(ledgerData)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-bold">${accId}</td>
      <td>${data.owner}</td>
      <td class="val-green font-bold">$${data.balance.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// Render Outbox table
function updateOutboxTable(outboxData) {
  const tbody = document.querySelector('#table-outbox tbody');
  tbody.innerHTML = '';
  if (outboxData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center val-muted">No outbox logs written yet.</td></tr>`;
    return;
  }
  
  // Show last 5 outbox entries
  const lastEntries = outboxData.slice(-5).reverse();
  for (const entry of lastEntries) {
    const payload = JSON.parse(entry.payload);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry.id}</td>
      <td class="font-bold">${entry.accountId}</td>
      <td>${payload.type} ($${payload.amount})</td>
      <td><span class="status-badge ${entry.status.toLowerCase()}">${entry.status}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

// Render partitions
function updatePartitions(partitions) {
  for (let p = 0; p < partitions.length; p++) {
    const lane = document.getElementById(`p-${p}-messages`);
    lane.innerHTML = '';
    
    // Show last 3 messages in partition
    const messages = partitions[p].slice(-3).reverse();
    for (const msg of messages) {
      const div = document.createElement('div');
      
      let details = '';
      if (typeof msg.payload === 'object' && msg.payload !== null) {
        details = `${msg.payload.type || 'EVENT'}: $${Number(msg.payload.amount).toFixed(2)}`;
        div.className = `msg-bubble ${msg.payload.type === 'DEBIT' ? 'msg-bubble-debit' : 'msg-bubble-credit'}`;
      } else {
        details = (typeof msg.payload === 'string') ? msg.payload.substring(0, 25) : 'Poison Pill';
        div.className = 'msg-bubble msg-bubble-debit'; // Corrupted/Chaos
      }
      
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:600;">
          <span>${msg.eventId}</span>
          <span class="val-muted">seq:${msg.sequenceNumber}</span>
        </div>
        <div style="font-size: 10px; margin-top:2px;">${details}</div>
      `;
      lane.appendChild(div);
    }
    
    if (messages.length === 0) {
      lane.innerHTML = `<div class="text-center val-muted" style="font-size:10px; padding:10px;">Empty Partition</div>`;
    }
  }
}

// Update telemetry and animations for GoldenGate CDC Agent
function updateCdcStatus(state) {
  const totalProcessed = state.cdcRelayHistory.length;
  document.getElementById('cdc-relayed-count').innerText = totalProcessed;
  
  const cdcStatusText = document.getElementById('cdc-agent-status');
  const flowDot = document.getElementById('cdc-flow-dot');
  
  // Calculate if there are pending messages
  const pendingRows = state.outbox.filter(row => row.status === 'PENDING');
  
  if (!state.streamEngineOnline) {
    cdcStatusText.innerText = 'LAGGING (OFFLINE)';
    cdcStatusText.className = 'val-red font-bold';
    flowDot.className = 'flow-dot'; // Turn off animation
    
    if (pendingRows.length > 0 && prevOutboxCount !== pendingRows.length) {
      logToScreen('cdc-telemetry', `[CDC Broker Timeout] Connection refused. Relays paused. Accumulated backlogs: ${pendingRows.length} rows.`, 'warn');
      prevOutboxCount = pendingRows.length;
    }
  } else {
    cdcStatusText.innerText = 'ACTIVE (SYNC)';
    cdcStatusText.className = 'val-green font-bold';
    
    if (pendingRows.length > 0) {
      flowDot.className = 'flow-dot flow-active'; // Play animation
      logToScreen('cdc-telemetry', `Processing backlog of ${pendingRows.length} rows...`, 'info');
    } else {
      flowDot.className = 'flow-dot'; // Stop animation
    }
    
    // Log new relay successes
    if (state.cdcRelayHistory.length > 0) {
      const lastRelay = state.cdcRelayHistory[state.cdcRelayHistory.length - 1];
      const match = state.outbox.find(row => row.id === lastRelay.outboxId);
      if (match && match.relayedAt && (Date.now() - match.relayedAt < 1000)) {
        logToScreen('cdc-telemetry', `Relayed DB outbox event ID ${lastRelay.outboxId} to stream partition ${lastRelay.partition} successfully.`, 'success');
      }
    }
    prevOutboxCount = 0;
  }
}

// Update telemetry metrics and charts
function updateMetrics(metrics) {
  document.getElementById('metric-ingested').innerText = metrics.totalIngestedCount;
  document.getElementById('metric-valid').innerText = metrics.cleanProcessedCount;
  document.getElementById('metric-dlq').innerText = metrics.dlqCount;

  // Render throughput history graph bars
  const barsContainer = document.getElementById('throughput-chart-bars');
  barsContainer.innerHTML = '';
  
  const history = metrics.throughputHistory;
  const maxVal = Math.max(...history, 5); // Base scale max height

  history.forEach((val, i) => {
    const pct = (val / maxVal) * 100;
    const bar = document.createElement('div');
    bar.className = 't-bar';
    if (val > 4) bar.className = 't-bar chaos-high';
    bar.style.height = `${pct}%`;
    bar.title = `${val} tx/sec`;
    barsContainer.appendChild(bar);
  });
  
  document.getElementById('throughput-current').innerText = `Current Throughput: ${history[history.length - 1]} tx/sec`;
}

// Render DLQ Table
function updateDlqTable(dlqData) {
  const tbody = document.querySelector('#table-dlq tbody');
  tbody.innerHTML = '';
  
  if (dlqData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center val-muted">No isolated poison pills detected. Pipeline healthy.</td></tr>`;
    return;
  }
  
  // Show last 4 entries in DLQ
  const entries = dlqData.slice(-4).reverse();
  entries.forEach(entry => {
    const tr = document.createElement('tr');
    
    const payloadObj = entry.payload || {};
    const isolatedAtVal = payloadObj.isolatedAt || entry.isolatedAt || Date.now();
    let timeStr = new Date(isolatedAtVal).toLocaleTimeString();
    
    const rawEnv = payloadObj.rawEnvelope || entry.rawEnvelope || {};
    let payloadPreview = "";
    if (rawEnv.payload !== undefined && rawEnv.payload !== null) {
      payloadPreview = typeof rawEnv.payload === 'object' 
        ? JSON.stringify(rawEnv.payload) 
        : String(rawEnv.payload);
    }
    
    if (payloadPreview.length > 50) {
      payloadPreview = payloadPreview.substring(0, 47) + '...';
    }

    tr.innerHTML = `
      <td class="val-red">${timeStr}</td>
      <td class="font-bold">${payloadObj.errorReason || entry.errorReason || ""}</td>
      <td class="val-cyan">${payloadObj.consumerNodeId || entry.consumerNodeId || ""}</td>
      <td style="font-family: monospace; font-size:10.5px; background: rgba(0,0,0,0.15)">${payloadPreview}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// Exercise 1 Actions
// ==========================================
async function runExercise1() {
  const accId = document.getElementById('ex1-account').value;
  const amount = Number(document.getElementById('ex1-amount').value);
  const type = document.getElementById('ex1-type').value;

  logToScreen('ex1-telemetry', `Initializing non-blocking ingestion test for account: ${accId}...`, 'info');
  logToScreen('ex1-telemetry', `Firing 5 concurrent API publisher gateway writes...`, 'info');

  const promises = [];
  
  // Dispatch 5 concurrent transaction events to simulate bank traffic spikes
  for (let i = 0; i < 5; i++) {
    const payload = {
      accountId: accId,
      amount: amount + (i * 10), // slight difference to track
      type: type,
      routingCode: 'RT-9827',
      timestamp: Date.now()
    };
    
    promises.push(
      fetch('/api/stream/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(async res => {
        const data = await res.json();
        if (res.ok) {
          logToScreen('ex1-telemetry', `Gateway HTTP 202 Accepted. Event ${data.envelope.eventId} assigned deterministically to Partition ${data.envelope.partition}`, 'success');
        } else {
          logToScreen('ex1-telemetry', `Gateway Publish Failure: ${data.error}`, 'error');
        }
      }).catch(err => {
        logToScreen('ex1-telemetry', `Gateway Connection Timeout: ${err.message}`, 'error');
      })
    );
  }
  
  await Promise.all(promises);
  logToScreen('ex1-telemetry', `Concurrency batch completed without block. Partition locks verified.`, 'info');
}

// ==========================================
// Exercise 2 Actions
// ==========================================
async function runExercise2() {
  const accountId = document.getElementById('ex2-account').value;
  const amount = Number(document.getElementById('ex2-amount').value);
  const type = document.getElementById('ex2-type').value;
  
  // Get selected mode
  const mode = document.querySelector('input[name="tx-mode"]:checked').value;
  
  logToScreen('ex1-telemetry', `Executing transaction on Account: ${accountId} | Mode: ${mode.toUpperCase()}...`, 'info');

  try {
    const res = await fetch('/api/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, amount, type, mode })
    });
    
    const data = await res.json();
    if (res.ok) {
      if (mode === 'dual_write') {
        logToScreen('ex1-telemetry', `[Dual-Write Transaction Success] Ledger balance: $${data.balance.toFixed(2)}. Direct publish to partition ${data.streamEnvelope.partition} verified.`, 'success');
      } else {
        logToScreen('ex1-telemetry', `[Outbox Transaction Success] Atomic local ledger & outbox row created. ID: ${data.outboxEntry.id}. Waiting for CDC relay...`, 'success');
      }
    } else {
      // Failed transaction
      logToScreen('ex1-telemetry', `[Transaction Aborted / Rolled Back] Error: ${data.error}`, 'error');
    }
  } catch (err) {
    logToScreen('ex1-telemetry', `Connection Error executing transaction: ${err.message}`, 'error');
  }
}

// ==========================================
// Exercise 3 Actions
// ==========================================
async function injectPoisonPill(chaosType) {
  let bodyData;
  let headers = {};

  if (chaosType === 'malformed_json') {
    bodyData = "{\"accountId\": \"ACC-1002\", \"amount\": 250.00, \"routingCode\": \"RT-CORRUPTED-\x00\x01\""; // Malformed JSON (unclosed quote/brace)
    headers['Content-Type'] = 'text/plain';
  } else if (chaosType === 'missing_routing') {
    bodyData = JSON.stringify({
      accountId: "ACC-1002",
      amount: 150.00
      // Missing routingCode
    });
    headers['Content-Type'] = 'application/json';
  } else if (chaosType === 'negative_amount') {
    bodyData = JSON.stringify({
      accountId: "ACC-1002",
      amount: -50.00, // Negative amount business violation
      routingCode: "RT-8812"
    });
    headers['Content-Type'] = 'application/json';
  } else if (chaosType === 'blacklisted_account') {
    bodyData = JSON.stringify({
      accountId: "ACC-CHAOS-VOID", // Blacklisted entity trigger
      amount: 25000.00,
      routingCode: "RT-VOID99"
    });
    headers['Content-Type'] = 'application/json';
  }

  logToScreen('ex1-telemetry', `[Chaos Injection] Injecting poison pill: ${chaosType.toUpperCase()}...`, 'warn');

  try {
    const res = await fetch('/api/stream/inject', {
      method: 'POST',
      headers: headers,
      body: bodyData
    });
    const data = await res.json();
    if (res.ok) {
      logToScreen('ex1-telemetry', `Poison payload injected to partition ${data.envelope.partition}. ID: ${data.envelope.eventId}. Checking DLQ metrics...`, 'info');
    }
  } catch (err) {
    console.error(err);
  }
}

// State polling starter
setInterval(fetchState, 500);
fetchState();
