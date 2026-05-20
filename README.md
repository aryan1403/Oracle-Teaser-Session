# Oracle Teaser Session: AI-Driven Automation for Complex Banking Workflows

This repository contains the enterprise demonstration suite for the Oracle Teaser Session. It showcases the evolution of software quality assurance from brittle legacy automation to true, AI-driven Agentic Test-Driven Development (TDD) and Chaos Engineering.

## Repository Structure

The suite is divided into two primary modules:

### Module 1: Self-Healing & Agentic TDD
Located in `/module1/`, this module focuses on resolving the brittleness of traditional test automation caused by frequent frontend UI changes (DOM structure, CSS classes, IDs). 

**Key Features:**
- **Legacy Automation (Brittle):** Demonstrates how traditional ID-based selectors fail when the frontend structure mutates.
- **Self-Healing Automation:** Utilizes Playwright's Accessibility Tree (`getByRole`) to ensure tests pass regardless of DOM scrambling.
- **AI-Augmented Data Generation:** Uses `faker.js` to synthesize highly complex, unique KYC regulatory payloads dynamically, preventing static data collisions and AML false positives.
- **True AI Agent Navigation:** Integrates `@zerostep/playwright` to execute browser commands via natural language, bypassing DOM locators entirely.
- **Shift-Left Agentic TDD:** An interactive Node.js pipeline that parses pure business requirements (Jira tickets) and dynamically generates Playwright test scripts before frontend development begins.

### Module 2: Chaos Engineering & Ledger Rollback
Located in `/module2/`, this module focuses on testing the backend transactional resilience of a Peer-to-Peer (P2P) Payment Gateway during severe API failures.

**Key Features:**
- **P2P Transfer Dashboard:** A simulated banking ledger supporting optimistic balance updates.
- **Network Fault Injection:** Uses Playwright's native network interception (`page.route`) to inject HTTP `429 Too Many Requests` status codes and complete connection aborts mid-flight.
- **Rollback Verification:** Ensures the frontend application gracefully catches API failures, safely rolls back the deducted funds, and leaves the ledger in a consistent state.
- **AI Rollback Validation:** Uses the ZeroStep AI agent to perform complex visual assertions on the ledger lock status and transaction state using natural language.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Playwright (`npm install -g @playwright/test`)
- ZeroStep Token (Requires `.env` file in `module1` directory with `ZEROSTEP_TOKEN=<your-token>`)

### Installation
Clone the repository and install dependencies for each module independently.

```bash
# Install Module 1 dependencies
cd module1
npm install

# Install Module 2 dependencies
cd ../module2
npm install
```

## Execution Guide

Please refer to the presentation guides located in each module for exact copy-pasteable execution commands to be used during the live demonstration:

- `module1/Oracle_Session_Presentation_Guide.md`
- `module2/Oracle_Session_Presentation_Guide.md`

## Architecture & Best Practices
- **Test Isolation:** Each Playwright specification is completely decoupled and standalone.
- **Deterministic Assertions:** All test scripts employ hard assertions ensuring zero false-positives.
- **Code Quality:** All scripts adhere to strict ECMAScript 6+ standards, omit non-technical comments, and implement modular abstractions where appropriate.
