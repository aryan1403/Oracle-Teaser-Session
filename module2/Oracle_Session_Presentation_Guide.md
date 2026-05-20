# Oracle Teaser Session: Module 2 Presenter's Guide

This document is your master presentation script and guide for **Module 2: Chaos Engineering & Ledger Rollback**. 

---

## Setting the Stage: The P2P Payment Ledger
**The Concept:** In modern financial ecosystems, transactional consistency is critical. When a user initiates a peer-to-peer (P2P) transfer, the banking UI optimistically deducts the balance. However, if the downstream payment clearing house fails mid-flight, the application must gracefully rollback the ledger to prevent funds from being trapped in limbo.

We built a modern P2P Transfer Dashboard that locks the transaction state during API resolution and reverts balances if clearing fails.

---

## Feature 1: The Happy Path (Standard Settled Transaction)
**The Concept:** Verifying that transactions settle successfully under normal conditions and the balance is committed.
**Usage:**
```bash
npx playwright test tests/01-happy-path.spec.js --headed
```
**Implementation:** Playwright intercepts `/api/clear-payment` and returns `200 OK`. The script fills the amount, confirms the transfer, and validates that the Sender's balance decreases while the Recipient's balance increases.

---

## Feature 2: Chaos Engineering (API Fault Injection)
**The Concept:** Rather than waiting for production outages to test recovery logic, we inject network failures and API errors directly in the test suite to validate rollback resilience.
**Usage:**
```bash
npx playwright test tests/02-chaos-injection.spec.js --headed
```
**Implementation:** Playwright intercepts `/api/clear-payment` and injects:
1. An HTTP `429 Too Many Requests` (Rate Limiting) code.
2. A network drop (`route.abort('connectionfailed')`).
**The Demo:** Run the test. Show how the application catches the 429 status code and network failure, restores the deducted funds to the Sender, changes the status to "Transaction Rolled Back", and safely unlocks the ledger.
**Business Impact:** Prevents ledger drift and customer disputes. Assures that financial transactions are atomic (either completely succeed or completely fail), maintaining regulatory compliance and customer trust.

---

## Feature 3: AI-Driven Rollback Verification (ZeroStep)
**The Concept:** Validating rollback state changes can require writing complex, custom DOM assertions. With ZeroStep, an AI Agent validates these states using natural language commands.
**Usage:** (Requires `ZEROSTEP_TOKEN` in configuration)
```bash
npx playwright test tests/03-ai-agent-rollback.spec.js --headed
```
**Implementation:** We replace traditional Playwright locators with ZeroStep natural language assertions:
- `await ai('Is the transaction state showing as Transaction Rolled Back?')`
- `await ai('Is the sender balance showing as $1000.00?')`
**The Demo:** Run the test. Watch the AI Agent execute the transaction, intercept the API with a failure, and seamlessly assert the rollback state using natural language.
**Business Impact:** Eliminates complex UI assertion maintenance. AI can visually verify if error notices match context, if ledger locks are resolved, and if correct balance amounts are restored without brittle selector code.
