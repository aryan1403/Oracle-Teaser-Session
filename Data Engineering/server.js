import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.text()); // To accept raw malformed payloads
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. OCI Streaming Service Simulator
// ==========================================
let streamEngineOnline = true;
const NUM_PARTITIONS = 4;

// Structure: Map of stream names to message lists or arrays of partitions
let streams = {
  'transaction-stream': Array.from({ length: NUM_PARTITIONS }, () => []),
  'dlq-stream': []
};

// Deterministic partition hash key assignment based on account ID
function getPartition(accountId) {
  if (!accountId) return 0;
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = accountId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % NUM_PARTITIONS;
}

// Publish payload to a stream
function publishToStream(streamName, payload) {
  if (!streamEngineOnline) {
    throw new Error('OCI Streaming Service Connection Timeout: Broker unreachable');
  }

  const timestamp = Date.now();
  const eventId = `evt_${Math.random().toString(36).substr(2, 9)}`;

  if (streamName === 'transaction-stream') {
    // Expecting payload to be parsed or raw
    let accountId = 'UNKNOWN';
    if (typeof payload === 'object' && payload !== null) {
      accountId = payload.accountId || 'UNKNOWN';
    } else if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        accountId = parsed.accountId || 'UNKNOWN';
      } catch (e) {
        // Keeps UNKNOWN
      }
    }

    const partition = getPartition(accountId);
    const envelope = {
      eventId,
      partition,
      sequenceNumber: streams['transaction-stream'][partition].length,
      payload,
      ingestedAt: timestamp
    };
    streams['transaction-stream'][partition].push(envelope);
    return envelope;
  } else if (streamName === 'dlq-stream') {
    const envelope = {
      eventId,
      partition: 0,
      sequenceNumber: streams['dlq-stream'].length,
      payload,
      ingestedAt: timestamp
    };
    streams['dlq-stream'].push(envelope);
    return envelope;
  }
}

// ==========================================
// 2. Mock Oracle Autonomous Database
// ==========================================
let ledger = {
  'ACC-1001': { balance: 5000.00, owner: 'Alpha Corp' },
  'ACC-1002': { balance: 10000.00, owner: 'Beta Industries' },
  'ACC-1003': { balance: 750.50, owner: 'Charlie LLC' }
};

let outbox = [];
let nextOutboxId = 1;
let cdcRelayHistory = [];

// Relational transaction executor with absolute atomicity boundary
function executeTransaction(accountId, amount, type, mode) {
  // 1. Snapshot ledger state for potential rollback
  const ledgerSnapshot = JSON.parse(JSON.stringify(ledger));
  const outboxSnapshot = [...outbox];
  const nextOutboxIdSnapshot = nextOutboxId;

  try {
    // Validation checks
    if (!ledger[accountId]) {
      throw new Error(`Account ${accountId} does not exist`);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Transaction amount must be a positive number');
    }

    // Apply balance update
    const currentBalance = ledger[accountId].balance;
    let newBalance = currentBalance;
    if (type === 'DEBIT') {
      if (currentBalance < amount) {
        throw new Error(`Insufficient funds for account ${accountId}. Current balance: $${currentBalance.toFixed(2)}`);
      }
      newBalance = currentBalance - amount;
    } else if (type === 'CREDIT') {
      newBalance = currentBalance + amount;
    } else {
      throw new Error(`Invalid transaction type: ${type}`);
    }

    // Update database ledger balance
    ledger[accountId].balance = newBalance;

    const eventPayload = {
      accountId,
      amount,
      type,
      routingCode: 'RT-9827',
      timestamp: Date.now(),
      balanceAfter: newBalance
    };

    if (mode === 'dual_write') {
      // DUAL WRITE MODE: Atomically write to ledger and publish directly to stream
      // If the stream is down, this throws and we catch it to perform DB rollback
      const streamEnvelope = publishToStream('transaction-stream', eventPayload);
      
      // Success returning
      return {
        success: true,
        mode,
        accountId,
        type,
        amount,
        balance: newBalance,
        streamEnvelope
      };
    } else {
      // OUTBOX PATTERN MODE: Write ledger balance and insert to outbox table inside atomic DB transaction
      const outboxEntry = {
        id: nextOutboxId++,
        accountId,
        eventType: 'TRANSACTION_COMMITTED',
        payload: JSON.stringify(eventPayload),
        status: 'PENDING',
        createdAt: Date.now()
      };
      outbox.push(outboxEntry);

      return {
        success: true,
        mode,
        accountId,
        type,
        amount,
        balance: newBalance,
        outboxEntry
      };
    }
  } catch (error) {
    // TRANSACTION ROLLBACK: Restore database state on any failure
    ledger = ledgerSnapshot;
    outbox = outboxSnapshot;
    nextOutboxId = nextOutboxIdSnapshot;
    throw error;
  }
}

// ==========================================
// 3. CDC Log-Reader Service (GoldenGate Simulator)
// ==========================================
let cdcRunning = true;
let cdcInterval = null;

function startCDCAgent() {
  if (cdcInterval) clearInterval(cdcInterval);
  cdcInterval = setInterval(() => {
    if (!cdcRunning) return;

    // Read un-relayed outbox rows
    const pendingRows = outbox.filter(row => row.status === 'PENDING');
    if (pendingRows.length === 0) return;

    if (!streamEngineOnline) {
      console.warn('[GoldenGate CDC] Streaming service unreachable. Unable to relay database outbox rows.');
      return;
    }

    for (const row of pendingRows) {
      try {
        const payload = JSON.parse(row.payload);
        const envelope = publishToStream('transaction-stream', payload);
        row.status = 'PROCESSED';
        row.relayedAt = Date.now();
        
        cdcRelayHistory.push({
          outboxId: row.id,
          eventId: envelope.eventId,
          partition: envelope.partition,
          relayedAt: row.relayedAt
        });
        console.log(`[GoldenGate CDC] Relayed outbox row ID ${row.id} to partition ${envelope.partition}`);
      } catch (err) {
        console.error(`[GoldenGate CDC] Failed to relay outbox row ID ${row.id}:`, err.message);
        break; // Stop processing further entries to maintain ordering
      }
    }
  }, 1000);
}

// ==========================================
// 4. Fraud Screening Engine (Consumer Node) & DLQ
// ==========================================
let cleanProcessedCount = 0;
let totalIngestedCount = 0;
let dlqHistory = [];
let throughputHistory = Array(20).fill(0);
let currentSecondsThroughput = 0;

// Poll streams for consuming
let consumerOffsets = Array(NUM_PARTITIONS).fill(0);

function startConsumerEngine() {
  setInterval(() => {
    // Scan all partitions for unconsumed messages
    for (let p = 0; p < NUM_PARTITIONS; p++) {
      const messages = streams['transaction-stream'][p];
      const offset = consumerOffsets[p];
      if (offset < messages.length) {
        const envelope = messages[offset];
        consumerOffsets[p]++; // Advance offset
        totalIngestedCount++;
        currentSecondsThroughput++;

        // EXCEPTION WRAPPER: Intercept validation or parsing failures
        try {
          const payload = envelope.payload;
          let data;

          if (typeof payload === 'string') {
            data = JSON.parse(payload);
          } else {
            data = payload;
          }

          // Schema Compliance Rules
          if (!data || typeof data !== 'object') {
            throw new SyntaxError('Message payload is not a valid JSON structure');
          }
          if (!data.accountId) {
            throw new Error('Schema Violation: Missing required routing attribute "accountId"');
          }
          if (typeof data.amount !== 'number' || isNaN(data.amount)) {
            throw new Error('Schema Violation: Missing or invalid "amount" property');
          }
          if (data.amount <= 0) {
            throw new Error('Business Rule Violation: Non-positive transaction amount');
          }
          if (!data.routingCode || !/^[A-Z0-9-]+$/.test(data.routingCode)) {
            throw new Error('Schema Violation: Invalid or corrupted "routingCode" format');
          }
          if (data.accountId === 'ACC-CHAOS-VOID') {
            throw new Error('Security Exception: Blacklisted Account Entity Identified');
          }

          // Process transaction message
          cleanProcessedCount++;
        } catch (error) {
          // Isolate Poison Pill to DLQ Topic instantly
          const dlqPacket = {
            rawEnvelope: envelope,
            errorReason: error.message,
            exceptionClass: error.constructor.name,
            isolatedAt: Date.now(),
            consumerNodeId: 'fraud-screener-node-01'
          };
          
          try {
            publishToStream('dlq-stream', dlqPacket);
            dlqHistory.push(dlqPacket);
            console.error(`[Fraud Engine] POISON PILL isolated to DLQ: ${error.message}`);
          } catch (dlqErr) {
            console.error('[Fraud Engine] Critical pipeline failure: DLQ stream offline!', dlqErr.message);
          }
        }
      }
    }
  }, 100);
}

// Throughput tracking loop (updates charts on UI)
setInterval(() => {
  throughputHistory.push(currentSecondsThroughput);
  throughputHistory.shift();
  currentSecondsThroughput = 0;
}, 1000);

// ==========================================
// 5. REST API Routes
// ==========================================

// Get complete state of the library
app.get('/api/state', (req, res) => {
  res.json({
    streamEngineOnline,
    ledger,
    outbox,
    cdcRelayHistory,
    streams: {
      'transaction-stream': streams['transaction-stream'],
      'dlq-stream': streams['dlq-stream']
    },
    metrics: {
      totalIngestedCount,
      cleanProcessedCount,
      dlqCount: streams['dlq-stream'].length,
      throughputHistory
    },
    consumerOffsets
  });
});

// Toggle stream engine connection
app.post('/api/stream/toggle', (req, res) => {
  streamEngineOnline = !streamEngineOnline;
  res.json({ success: true, streamEngineOnline });
});

// Execute transaction
app.post('/api/transaction', (req, res) => {
  const { accountId, amount, type, mode } = req.body;
  try {
    const result = executeTransaction(accountId, Number(amount), type, mode);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Inject raw payloads directly into stream (simulates direct streaming bypass / poison pills)
app.post('/api/stream/inject', (req, res) => {
  let payload = req.body;
  
  if (req.headers['content-type'] === 'application/json') {
    payload = req.body;
  }
  
  try {
    const envelope = publishToStream('transaction-stream', payload);
    res.json({ success: true, envelope });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset simulation state
app.post('/api/reset', (req, res) => {
  streamEngineOnline = true;
  ledger = {
    'ACC-1001': { balance: 5000.00, owner: 'Alpha Corp' },
    'ACC-1002': { balance: 10000.00, owner: 'Beta Industries' },
    'ACC-1003': { balance: 750.50, owner: 'Charlie LLC' }
  };
  outbox = [];
  nextOutboxId = 1;
  cdcRelayHistory = [];
  streams = {
    'transaction-stream': Array.from({ length: NUM_PARTITIONS }, () => []),
    'dlq-stream': []
  };
  consumerOffsets = Array(NUM_PARTITIONS).fill(0);
  cleanProcessedCount = 0;
  totalIngestedCount = 0;
  dlqHistory = [];
  throughputHistory = Array(20).fill(0);
  currentSecondsThroughput = 0;
  res.json({ success: true });
});

// Start tasks
startCDCAgent();
startConsumerEngine();

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Simulation Gateway] Running on http://localhost:${PORT}`);
});
