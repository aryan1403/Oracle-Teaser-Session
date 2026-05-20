# Oracle Teaser Session: AI-Driven Automation for Complex Banking Workflows

This repository contains the demonstration suite for the Oracle Teaser Session, showcasing the transformation from legacy, brittle test automation to modern, AI-driven, self-healing architectures.

## The Challenge
Dynamic UI changes in modern net-banking portals often break traditional test automation scripts. Furthermore, complex multi-layered API payloads required for KYC (Know Your Customer) and regulatory compliance evaluations are difficult to manage with static datasets.

## The Solution
1. **Self-Healing Automation:** Utilizing the semantic Accessibility Tree to natively handle layout drift and structural DOM mutations.
2. **AI-Augmented Data Generation:** Dynamically synthesizing regulatory-compliant payloads (PII, AML screenings) to ensure test robustness.
3. **True AI Agents (ZeroStep):** Exploring the bleeding edge of natural-language browser automation, removing the need for DOM locators entirely.

## Project Structure
- `module1/app/`: The simulated Core Banking Portal (Loan Eligibility Calculator) with a built-in structural mutation trigger.
- `module1/tests/01-traditional-automation.spec.js`: Demonstrates the failure points of traditional CSS/XPath locators.
- `module1/tests/02-self-healing-automation.spec.js`: Demonstrates self-healing capabilities using semantic locators.
- `module1/tests/03-ai-data-generation.spec.js`: Showcases dynamic, compliant KYC payload generation.
- `module1/tests/04-true-ai-agent.spec.js`: Demonstrates advanced LLM-driven test execution via natural language processing.

## Getting Started

1. Navigate to the module directory:
   ```bash
   cd module1
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Ensure Playwright browsers are installed:
   ```bash
   npx playwright install chromium
   ```

4. **ZeroStep Configuration:** To run the True AI Agent script (`04-true-ai-agent.spec.js`), you must configure your API token in a `.env` file within the `module1` directory:
   ```env
   ZEROSTEP_TOKEN=your_token_here
   ```

## Execution
Run the automated test suite in UI mode for presentation purposes:
```bash
npx playwright test --headed
```

## Advancing the AI Approach
To scale this solution further for enterprise banking:
- **LLM-Based Data Synthesis:** Replace `faker.js` with an integration to an LLM API (like OpenAI or Cohere) to generate highly contextual, temporally-aware financial histories that match specific testing personas.
- **Visual Regression AI:** Integrate AI-based visual diffing tools (e.g., Applitools) alongside Playwright to catch unintended visual mutations without asserting exact pixel differences.
- **Autonomous Test Generation:** Implement a pipeline step that reads Jira acceptance criteria and automatically drafts the natural-language ZeroStep Playwright scripts before development even begins.
