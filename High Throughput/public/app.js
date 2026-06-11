// State tracking
let previousState = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  startStatePolling();
  setupSSELogs();
});

// Event Handlers for Controls
function setupEventListeners() {
  document.getElementById('btn-start').addEventListener('click', () => {
    fetch('/api/action/start-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eps: 3 })
    });
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    fetch('/api/action/stop-stream', { method: 'POST' });
  });

  document.getElementById('btn-inject-dup').addEventListener('click', () => {
    fetch('/api/action/inject-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 3 })
    });
  });

  document.getElementById('btn-kill-c').addEventListener('click', () => {
    fetch('/api/action/kill-c', { method: 'POST' });
  });

  document.getElementById('btn-start-c').addEventListener('click', () => {
    fetch('/api/action/start-c', { method: 'POST' });
  });

  document.getElementById('btn-inject-poison').addEventListener('click', () => {
    fetch('/api/action/inject-poison', { method: 'POST' });
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    fetch('/api/action/reset', { method: 'POST' });
  });

  document.getElementById('btn-clear-console').addEventListener('click', () => {
    document.getElementById('console-logs').innerHTML = '';
  });
}

// Polling Loop for State Visualizer
function startStatePolling() {
  setInterval(async () => {
    try {
      const response = await fetch('/api/state');
      const state = await response.json();
      updateUI(state);
      previousState = state;
    } catch (e) {
      console.error("Failed to poll state:", e);
    }
  }, 400);
}

// SSE Connection for Live Logs
function setupSSELogs() {
  const eventSource = new EventSource('/api/logs');
  const consoleContainer = document.getElementById('console-logs');

  eventSource.onmessage = (event) => {
    const log = JSON.parse(event.data);
    const line = document.createElement('div');
    line.className = `console-line ${getLogClass(log.source)}`;
    line.textContent = `[${log.timestamp.split('T')[1].substring(0, 8)}] [${log.source}] ${log.message}`;
    
    consoleContainer.appendChild(line);
    consoleContainer.scrollTop = consoleContainer.scrollHeight;
  };

  eventSource.onerror = (err) => {
    console.error("SSE stream disconnected. Reconnecting...");
  };
}

function getLogClass(source) {
  if (source === 'BROKER') return 'broker';
  if (source === 'COORDINATOR') return 'coordinator';
  if (source === 'PRODUCER') return 'producer';
  if (source === 'DLQ') return 'dlq';
  if (source.startsWith('Consumer')) return 'consumer';
  return 'sys';
}

// Render dynamic elements
function updateUI(state) {
  // Update streaming status header
  const pulse = document.getElementById('stream-pulse');
  const text = document.getElementById('stream-status-text');
  if (state.streamingActive) {
    pulse.className = 'pulse-indicator status-active';
    text.textContent = 'Active Ingestion Pipeline (Running)';
  } else {
    pulse.className = 'pulse-indicator status-idle';
    text.textContent = 'Ingestion Pipeline Idle (Paused)';
  }

  renderPartitions(state.broker.partitions);
  renderConsumers(state.consumers);
  renderLedger(state.broker.ledger);
  renderDLQ(state.broker.dlq);
}

// Draw partition queues
function renderPartitions(partitions) {
  const container = document.getElementById('partitions-wrapper');
  container.innerHTML = '';

  partitions.forEach((part) => {
    const card = document.createElement('div');
    card.className = 'partition-card';
    
    // Check if new messages arrived to flash the card
    if (previousState) {
      const prevPart = previousState.broker.partitions.find(p => p.id === part.id);
      if (prevPart && part.length > prevPart.length) {
        card.classList.add('active-ingest');
        setTimeout(() => card.classList.remove('active-ingest'), 400);
      }
    }

    const header = document.createElement('div');
    header.className = 'partition-card-header';
    header.innerHTML = `
      <span class="partition-name">Partition-${part.id}</span>
      <span class="partition-count">${part.length} Events</span>
    `;

    const msgsList = document.createElement('div');
    msgsList.className = 'partition-messages';
    
    if (part.messages.length === 0) {
      msgsList.innerHTML = '<div style="color:var(--text-dark); text-align:center; padding-top:20px;">Empty Partition Queue</div>';
    } else {
      part.messages.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'msg-item';
        
        // Detect if this is a newly arrived message to trigger a flash
        if (previousState) {
          const prevPart = previousState.broker.partitions.find(p => p.id === part.id);
          const isNew = !prevPart || msg.offset >= prevPart.length;
          if (isNew) {
            item.classList.add('new-msg');
          }
        }
        
        let amountText = '';
        if (msg.payload && typeof msg.payload === 'object' && msg.payload.amount !== undefined) {
          amountText = `$${msg.payload.amount}`;
        } else if (typeof msg.payload === 'string') {
          amountText = 'CORRUPT';
        }

        item.innerHTML = `
          <span>Offset #${msg.offset} : ${msg.accountId}</span>
          <span style="font-weight:600;">${amountText}</span>
        `;
        msgsList.appendChild(item);
      });
      // Scroll to bottom of partition log to show newest events
      setTimeout(() => { msgsList.scrollTop = msgsList.scrollHeight; }, 10);
    }

    card.appendChild(header);
    card.appendChild(msgsList);
    container.appendChild(card);
  });
}

// Draw consumer instances
function renderConsumers(consumers) {
  const container = document.getElementById('consumers-wrapper');
  container.innerHTML = '';

  // Count active consumers for rebalance badge
  let activeCount = 0;
  for (const id in consumers) {
    if (consumers[id].active) activeCount++;
  }
  document.getElementById('rebalance-counter').textContent = `${activeCount} / 3 Nodes`;

  for (const id in consumers) {
    const c = consumers[id];
    const card = document.createElement('div');
    card.className = `consumer-card ${c.active ? 'active-node' : 'inactive-node'}`;

    const avatar = document.createElement('div');
    avatar.className = 'consumer-avatar-wrapper';
    avatar.innerHTML = `
      <div class="consumer-icon"></div>
      <span class="consumer-name">${c.id}</span>
    `;

    const info = document.createElement('div');
    info.className = 'consumer-info';
    
    // Build assigned partitions list tags
    let partsTags = '';
    if (c.active && c.assignedPartitions.length > 0) {
      c.assignedPartitions.forEach(p => {
        partsTags += `<span class="part-tag">Part-${p}</span>`;
      });
    } else if (c.active) {
      partsTags = '<span style="font-size:11px; color:var(--amber);">Rebalancing...</span>';
    } else {
      partsTags = '<span style="font-size:11px; color:var(--red);">Offline</span>';
    }

    info.innerHTML = `
      <div class="consumer-meta-row">
        <span style="color:var(--text-muted);">Status:</span>
        <span style="font-weight:600; color:${c.active ? 'var(--green)' : 'var(--red)'};">
          ${c.active ? 'PROCESSING' : 'SHUTDOWN'}
        </span>
      </div>
      <div class="consumer-meta-row" style="align-items: center;">
        <span style="color:var(--text-muted);">Assigned Topics:</span>
        <div class="consumer-part-tags">${partsTags}</div>
      </div>
      <div class="consumer-stats">
        <div class="stat-item processed-val">Processed: <span>${c.metrics.processedCount}</span></div>
        <div class="stat-item duplicate-val">Deduplicated: <span>${c.metrics.duplicateCount}</span></div>
        <div class="stat-item" style="color:var(--red);">Errors: <span>${c.metrics.errorCount}</span></div>
      </div>
    `;

    card.appendChild(avatar);
    card.appendChild(info);
    container.appendChild(card);
  }
}

// Draw ledger balances
function renderLedger(ledger) {
  const tbody = document.getElementById('ledger-body');
  tbody.innerHTML = '';

  const accounts = Object.keys(ledger).sort();
  if (accounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dark);">No ledger state transitions generated.</td></tr>';
    return;
  }

  accounts.forEach(acc => {
    const bal = ledger[acc];
    const tr = document.createElement('tr');
    
    // Flash balance if updated
    if (previousState && previousState.broker.ledger[acc] !== bal) {
      tr.style.backgroundColor = 'hsla(145, 80%, 42%, 0.1)';
      setTimeout(() => tr.style.backgroundColor = 'transparent', 600);
    }

    tr.innerHTML = `
      <td style="font-weight:600; font-family:var(--font-mono);">${acc}</td>
      <td class="balance-col">$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td>USD</td>
      <td><span class="badge green-badge" style="font-size: 9px; padding: 2px 6px;">COMMITTED</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Draw DLQ items
function renderDLQ(dlq) {
  const container = document.getElementById('dlq-wrapper');
  const badge = document.getElementById('dlq-badge');
  badge.textContent = `${dlq.length} Interceptions`;
  
  if (dlq.length === 0) {
    container.innerHTML = '<div class="empty-dlq-msg">No poison pills isolated. Pipeline operates in safe boundaries.</div>';
    badge.className = 'badge green-badge';
    return;
  }

  badge.className = 'badge red-badge';
  container.innerHTML = '';

  // Render last 3 poison pills to keep the UI clean
  const lastThree = dlq.slice(-3).reverse();
  lastThree.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'dlq-item';
    
    // Parse timestamp to readable format
    const timeStr = new Date(item.timestamp).toISOString().split('T')[1].substring(0, 8);
    
    let payloadDump = '';
    if (typeof item.originalMessage.payload === 'object') {
      payloadDump = JSON.stringify(item.originalMessage.payload);
    } else {
      payloadDump = String(item.originalMessage.payload);
    }
    
    card.innerHTML = `
      <div class="dlq-item-header">
        <span>POISON_PILL INTERCEPTED</span>
        <span>${timeStr}</span>
      </div>
      <div class="dlq-reason">Reason: ${item.errorReason}</div>
      <div class="dlq-meta">
        Consumer Node: ${item.consumerId} | Account Key: ${item.originalMessage.accountId}<br>
        Payload: <span style="color:var(--text-muted); font-size:10px;">${payloadDump}</span>
      </div>
    `;
    container.appendChild(card);
  });
}
