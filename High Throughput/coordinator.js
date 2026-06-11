export class ConsumerGroupCoordinator {
  constructor(broker, numPartitions = 4) {
    this.broker = broker;
    this.numPartitions = numPartitions;
    this.groupId = 'ledger-consumer-group';
    this.consumers = new Map(); // consumerId -> ConsumerInstance
  }

  registerConsumer(consumerId, consumerInstance) {
    this.broker.log('COORDINATOR', `Consumer [${consumerId}] registering to Group [${this.groupId}]`);
    this.consumers.set(consumerId, consumerInstance);
    this.rebalance();
  }

  deregisterConsumer(consumerId) {
    if (this.consumers.has(consumerId)) {
      this.broker.log('COORDINATOR', `Consumer [${consumerId}] disconnected/failed. Triggering rebalance...`);
      this.consumers.delete(consumerId);
      this.rebalance();
    }
  }

  rebalance() {
    const activeConsumers = Array.from(this.consumers.keys()).sort();
    const numConsumers = activeConsumers.length;
    
    this.broker.log('COORDINATOR', `Starting partition rebalance for ${numConsumers} active consumers...`);
    const rebalanceStart = Date.now();

    // Clear current assignments
    for (const [id, consumer] of this.consumers.entries()) {
      consumer.assignedPartitions = [];
    }

    if (numConsumers > 0) {
      // Divide partitions: 0..numPartitions-1
      for (let p = 0; p < this.numPartitions; p++) {
        const consumerIdx = p % numConsumers;
        const targetConsumerId = activeConsumers[consumerIdx];
        this.consumers.get(targetConsumerId).assignedPartitions.push(p);
      }
    }

    const rebalanceDuration = Date.now() - rebalanceStart;
    
    // Log assignments
    const assignmentsSummary = {};
    for (const [id, consumer] of this.consumers.entries()) {
      assignmentsSummary[id] = consumer.assignedPartitions;
      this.broker.log('COORDINATOR', `Assigned Partitions ${JSON.stringify(consumer.assignedPartitions)} to Consumer [${id}]`);
      // Notify consumer to update its poll state
      consumer.onPartitionsReassigned();
    }

    const logMsg = `Rebalance completed in ${rebalanceDuration}ms. Active Group: ${JSON.stringify(assignmentsSummary)}`;
    this.broker.log('COORDINATOR', logMsg);
    this.broker.rebalanceLogs.push({
      timestamp: new Date().toISOString(),
      activeConsumers,
      assignments: assignmentsSummary,
      durationMs: rebalanceDuration
    });

    if (this.broker.onStateChangeCallback) {
      this.broker.onStateChangeCallback();
    }
  }
}
