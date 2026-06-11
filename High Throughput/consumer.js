export class ConsumerInstance {
  constructor(id, coordinator, broker) {
    this.id = id;
    this.coordinator = coordinator;
    this.broker = broker;
    this.assignedPartitions = [];
    this.active = false;
    this.pollInterval = null;
    this.processedOffsets = {}; // partitionId -> last processed offset
    
    // Metrics local to this consumer
    this.metrics = {
      processedCount: 0,
      duplicateCount: 0,
      errorCount: 0
    };
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.coordinator.registerConsumer(this.id, this);
    
    // Start polling loop
    this.pollInterval = setInterval(() => this.pollAndProcess(), 100);
    this.broker.log(this.id, `Consumer instance started polling loops.`);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.broker.log(this.id, `Consumer instance shutting down.`);
    this.coordinator.deregisterConsumer(this.id);
  }

  onPartitionsReassigned() {
    // Reinitialize partition offset local tracking if needed,
    // or fetch last committed offset from broker
    for (const p of this.assignedPartitions) {
      const committed = this.broker.getCommittedOffset(this.coordinator.groupId, p);
      this.processedOffsets[p] = committed;
    }
  }

  async pollAndProcess() {
    if (!this.active || this.assignedPartitions.length === 0) return;

    for (const partitionId of this.assignedPartitions) {
      const currentLocalOffset = this.processedOffsets[partitionId] || 0;
      const partitionQueue = this.broker.partitions[partitionId];
      
      // If there are new messages to consume
      if (currentLocalOffset < partitionQueue.length) {
        const message = partitionQueue[currentLocalOffset];
        
        // Process message asynchronously to simulate processing delays
        await this.processMessage(partitionId, message);
        
        // Advance local offset and commit
        this.processedOffsets[partitionId] = currentLocalOffset + 1;
        this.broker.commitOffset(this.coordinator.groupId, partitionId, currentLocalOffset + 1);
      }
    }
  }

  async processMessage(partitionId, message) {
    const rawPayload = message.payload;
    
    try {
      // 1. Schema & Integrity Validation (Catch Poison Pills)
      this.validatePayload(rawPayload);

      const { transactionId, accountId, amount } = rawPayload;

      // 2. Idempotency Gate (Deduplication Check)
      if (this.broker.deduplicationCache.has(transactionId)) {
        this.metrics.duplicateCount++;
        this.broker.metrics.duplicateCount++;
        this.broker.log(this.id, `IDEMPOTENCY ALERT: Duplicate transaction signature [${transactionId}] intercepted. Dropping event.`);
        return;
      }

      // Simulate OCI replica log replication delay (e.g. 30ms)
      await new Promise(resolve => setTimeout(resolve, 30));

      // 3. Mutate Central Ledger Balance atomically
      if (!this.broker.ledger[accountId]) {
        this.broker.ledger[accountId] = 0;
      }
      this.broker.ledger[accountId] = parseFloat((this.broker.ledger[accountId] + amount).toFixed(2));

      // 4. Update Deduplication Cache
      this.broker.deduplicationCache.add(transactionId);
      
      // Update metrics
      this.metrics.processedCount++;
      this.broker.metrics.processedCount++;
      this.broker.log(this.id, `Successfully processed transaction [${transactionId}]. Mutation: ${accountId} += $${amount}. Balance: $${this.broker.ledger[accountId]}`);

    } catch (error) {
      this.metrics.errorCount++;
      this.broker.log(this.id, `CRITICAL: Schema validation failed. Routing message to DLQ. Error: ${error.message}`);
      
      // Forward poison pill to DLQ on the broker
      this.broker.sendToDLQ(message, this.id, error.message);
    }
  }

  validatePayload(payload) {
    // Check if the payload itself is malformed or un-parseable
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        throw new Error("Raw message is not a valid JSON structure");
      }
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error("Payload is null, undefined or not an object");
    }

    // Check transactionId presence and validity
    if (payload.transactionId === undefined || payload.transactionId === null) {
      throw new Error("Payload schema violation: missing transactionId signature");
    }
    if (typeof payload.transactionId !== 'string' || payload.transactionId.length < 5) {
      throw new Error(`Payload schema violation: invalid transactionId format: ${payload.transactionId}`);
    }

    // Check accountId
    if (!payload.accountId || typeof payload.accountId !== 'string') {
      throw new Error("Payload schema violation: missing or invalid accountId");
    }

    // Check amount
    if (payload.amount === undefined || payload.amount === null || typeof payload.amount !== 'number') {
      throw new Error(`Payload schema violation: invalid amount format: ${payload.amount}`);
    }
    if (payload.amount <= 0) {
      throw new Error(`Payload schema violation: non-positive transaction value: $${payload.amount}`);
    }
  }
}
