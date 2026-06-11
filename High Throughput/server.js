import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { VirtualBroker } from './broker.js';
import { EventProducer } from './producer.js';
import { ConsumerGroupCoordinator } from './coordinator.js';
import { ConsumerInstance } from './consumer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Initialize Pipeline Infrastructure
const broker = new VirtualBroker(4);
const coordinator = new ConsumerGroupCoordinator(broker, 4);
const producer = new EventProducer(broker);

// 2. Spin up the Consumer Group Instance Registry
const consumers = {
  'Consumer-A': new ConsumerInstance('Consumer-A', coordinator, broker),
  'Consumer-B': new ConsumerInstance('Consumer-B', coordinator, broker),
  'Consumer-C': new ConsumerInstance('Consumer-C', coordinator, broker)
};

// Start A and B by default to simulate initial active cluster
consumers['Consumer-A'].start();
consumers['Consumer-B'].start();
consumers['Consumer-C'].start();

// 3. Keep track of SSE clients for real-time log streaming
let sseClients = [];

broker.onLog((logEntry) => {
  sseClients.forEach(client => {
    client.write(`data: ${JSON.stringify(logEntry)}\n\n`);
  });
});

// 4. API Routes
app.get('/api/state', (req, res) => {
  const activeConsumers = {};
  for (const [id, c] of Object.entries(consumers)) {
    activeConsumers[id] = {
      id: c.id,
      active: c.active,
      assignedPartitions: c.assignedPartitions,
      processedOffsets: c.processedOffsets,
      metrics: c.metrics
    };
  }

  res.json({
    broker: broker.getState(),
    consumers: activeConsumers,
    streamingActive: producer.activeInterval !== null
  });
});

app.post('/api/action/start-stream', (req, res) => {
  const eps = req.body.eps || 3;
  producer.startContinuousStream(eps);
  res.json({ status: 'success', message: `Continuous ingestion stream started at ${eps} events/sec` });
});

app.post('/api/action/stop-stream', (req, res) => {
  producer.stopContinuousStream();
  res.json({ status: 'success', message: 'Continuous ingestion stream stopped' });
});

app.post('/api/action/inject-duplicates', (req, res) => {
  const count = req.body.count || 3;
  producer.injectDuplicates(count);
  res.json({ status: 'success', message: `Injected ${count} duplicate transaction pairs` });
});

app.post('/api/action/kill-c', (req, res) => {
  consumers['Consumer-C'].stop();
  res.json({ status: 'success', message: 'Consumer-C shutdown triggered. Coordinator rebalancing started.' });
});

app.post('/api/action/start-c', (req, res) => {
  consumers['Consumer-C'].start();
  res.json({ status: 'success', message: 'Consumer-C started and joined group. Rebalance triggered.' });
});

app.post('/api/action/inject-poison', (req, res) => {
  producer.injectPoisonPill();
  res.json({ status: 'success', message: 'Deliberately injected malformed transaction' });
});

app.post('/api/action/reset', (req, res) => {
  producer.stopContinuousStream();
  broker.reset();
  
  // Restart all consumers to default active state
  for (const id in consumers) {
    consumers[id].stop();
    consumers[id].metrics = { processedCount: 0, duplicateCount: 0, errorCount: 0 };
    consumers[id].processedOffsets = {};
    consumers[id].start();
  }
  
  res.json({ status: 'success', message: 'All pipeline states reset' });
});

// SSE endpoint for live telemetry logs
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  sseClients.push(res);
  
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Serve UI dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  broker.log('SYSTEM', `OCI Streaming & Ledger Pipeline Simulator running on http://localhost:${PORT}`);
});
