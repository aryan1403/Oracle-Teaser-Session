import crypto from 'crypto';

export class VirtualBroker {
  constructor(numPartitions = 4) {
    this.numPartitions = numPartitions;
    this.partitions = Array.from({ length: numPartitions }, () => []);
    this.dlq = [];
    this.committedOffsets = {}; // groupId -> { partitionId: offset }
    this.ledger = {}; // accountId -> balance
    this.deduplicationCache = new Set(); // transactionId cache
    this.rebalanceLogs = [];
    this.systemLogs = [];
    this.metrics = {
      producedCount: 0,
      processedCount: 0,
      duplicateCount: 0,
      dlqCount: 0,
      throughputRates: []
    };
  }

  log(source, message) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      source,
      message
    };
    this.systemLogs.push(logEntry);
    if (this.systemLogs.length > 500) {
      this.systemLogs.shift();
    }
    // Also print to console for terminal audit
    console.log(`[${logEntry.timestamp}] [${source}] ${message}`);
    
    // Express app can listen to these logs if we emit them
    if (this.onLogCallback) {
      this.onLogCallback(logEntry);
    }
  }

  onLog(callback) {
    this.onLogCallback = callback;
  }

  // Hash accountId to map to a partition index
  getPartitionIndex(accountId) {
    if (!accountId) return 0;
    let hash = 0;
    for (let i = 0; i < accountId.length; i++) {
      hash = (hash << 5) - hash + accountId.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) % this.numPartitions;
  }

  // Publish message to virtual broker
  publish(accountId, payload) {
    const partitionIdx = this.getPartitionIndex(accountId);
    const sequenceNumber = this.partitions[partitionIdx].length;
    
    const message = {
      offset: sequenceNumber,
      timestamp: Date.now(),
      accountId,
      payload
    };

    this.partitions[partitionIdx].push(message);
    this.metrics.producedCount++;
    
    this.log('BROKER', `Ingested msg at Partition [${partitionIdx}], Offset [${sequenceNumber}] for Account [${accountId}]`);
    return { partitionIdx, offset: sequenceNumber };
  }

  // Send message directly to Dead Letter Queue (DLQ)
  sendToDLQ(message, consumerId, reason) {
    const dlqMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      originalMessage: message,
      consumerId,
      errorReason: reason
    };
    this.dlq.push(dlqMessage);
    this.metrics.dlqCount++;
    this.log('DLQ', `ISOLATED poison pill from consumer [${consumerId}]. Reason: ${reason}`);
    
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  // Fetch offsets for a consumer group
  getCommittedOffset(groupId, partitionId) {
    if (!this.committedOffsets[groupId]) {
      this.committedOffsets[groupId] = {};
    }
    if (this.committedOffsets[groupId][partitionId] === undefined) {
      this.committedOffsets[groupId][partitionId] = 0;
    }
    return this.committedOffsets[groupId][partitionId];
  }

  // Commit offsets for a consumer group
  commitOffset(groupId, partitionId, offset) {
    if (!this.committedOffsets[groupId]) {
      this.committedOffsets[groupId] = {};
    }
    this.committedOffsets[groupId][partitionId] = offset;
    this.log('BROKER', `Committed Offset [${offset}] for Group [${groupId}] on Partition [${partitionId}]`);
    
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  // Register state change listener
  onStateChange(callback) {
    this.onStateChangeCallback = callback;
  }

  reset() {
    this.partitions = Array.from({ length: this.numPartitions }, () => []);
    this.dlq = [];
    this.committedOffsets = {};
    this.ledger = {};
    this.deduplicationCache.clear();
    this.rebalanceLogs = [];
    this.systemLogs = [];
    this.metrics = {
      producedCount: 0,
      processedCount: 0,
      duplicateCount: 0,
      dlqCount: 0,
      throughputRates: []
    };
    this.log('SYSTEM', 'Virtual Broker State Reset Complete');
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  getState() {
    return {
      numPartitions: this.numPartitions,
      partitions: this.partitions.map((p, i) => ({
        id: i,
        length: p.length,
        messages: p.slice(-10) // last 10 messages for preview
      })),
      dlq: this.dlq,
      committedOffsets: this.committedOffsets,
      ledger: this.ledger,
      deduplicationCacheSize: this.deduplicationCache.size,
      rebalanceLogs: this.rebalanceLogs,
      metrics: this.metrics,
      systemLogs: this.systemLogs.slice(-100) // last 100 logs
    };
  }
}
