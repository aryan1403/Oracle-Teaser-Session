import crypto from 'crypto';

export class EventProducer {
  constructor(broker) {
    this.broker = broker;
    this.activeInterval = null;
    this.accounts = ['ACC-7001', 'ACC-7002', 'ACC-7003', 'ACC-7004', 'ACC-7005', 'ACC-7006'];
  }

  // Generate a valid transaction schema
  createTransaction(accountId, customId = null, customAmount = null) {
    return {
      transactionId: customId || crypto.randomUUID(),
      accountId: accountId,
      amount: customAmount !== null ? customAmount : parseFloat((Math.random() * 1000 + 10).toFixed(2)),
      currency: 'USD',
      timestamp: Date.now()
    };
  }

  // Publish a single transaction
  sendTransaction(accountId, transaction) {
    return this.broker.publish(accountId, transaction);
  }

  // Send a rapid concurrent stream of events
  startContinuousStream(eventsPerSecond = 5) {
    if (this.activeInterval) return;

    this.broker.log('PRODUCER', `Starting continuous transaction stream at ${eventsPerSecond} events/sec`);
    this.activeInterval = setInterval(() => {
      const accountId = this.accounts[Math.floor(Math.random() * this.accounts.length)];
      const tx = this.createTransaction(accountId);
      this.sendTransaction(accountId, tx);
    }, 1000 / eventsPerSecond);
  }

  stopContinuousStream() {
    if (this.activeInterval) {
      clearInterval(this.activeInterval);
      this.activeInterval = null;
      this.broker.log('PRODUCER', 'Continuous transaction stream stopped');
    }
  }

  // Simulate network retry causing duplicates in the queue
  injectDuplicates(count = 5) {
    this.broker.log('PRODUCER', `Simulating network retries: Injecting ${count} duplicate transaction signatures...`);
    
    for (let i = 0; i < count; i++) {
      // Pick a random account
      const accountId = this.accounts[Math.floor(Math.random() * this.accounts.length)];
      // Create a transaction
      const tx = this.createTransaction(accountId);
      
      // Publish the first time
      this.sendTransaction(accountId, tx);
      
      // Publish the duplicate transaction after a tiny delay or immediately
      setTimeout(() => {
        this.broker.log('PRODUCER', `Network retry triggered: Re-publishing transaction [${tx.transactionId}]`);
        this.sendTransaction(accountId, tx);
      }, 50);
    }
  }

  // Inject a poison pill message (corrupted payload)
  injectPoisonPill() {
    this.broker.log('PRODUCER', 'Deliberately injecting malformed transaction payload (Poison Pill) into stream...');
    const accountId = this.accounts[Math.floor(Math.random() * this.accounts.length)];
    
    // Malformed JSON / missing transaction ID or non-numeric amount
    const poisonPayloads = [
      { transactionId: 'ERR-999', accountId: accountId, amount: 'NaN_INVALID_VAL', currency: 'USD', timestamp: Date.now() },
      { transactionId: null, accountId: accountId, amount: -5000, currency: 'USD', timestamp: Date.now() },
      "CORRUPTED_RAW_BINARY_STRING_FAIL_TO_PARSE_AS_JSON",
      { accountId: accountId, amount: 100.0 } // missing transactionId
    ];

    const payload = poisonPayloads[Math.floor(Math.random() * poisonPayloads.length)];
    
    // Publish malformed data
    this.broker.publish(accountId, payload);
  }
}
