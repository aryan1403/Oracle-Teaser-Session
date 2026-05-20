# JIRA-1025: Income Validation Logic

**Epic:** Core Banking Portal Revamp
**Assignee:** Frontend Team
**Status:** In Progress

## User Story
As a banking customer, I want the system to automatically reject my loan if my monthly income is insufficient for the requested loan amount.

## Acceptance Criteria
- **Scenario 1: Income Insufficient for High Loan**
  - **Given** the user navigates to the Loan Eligibility Calculator
  - **When** the user enters 500000 into the requested loan amount field
  - **And** the user enters 30 into the tenure field
  - **And** the user enters 2000 into the monthly income field
  - **And** the user clicks the calculate eligibility button
  - **Then** the eligibility status should be Requires Manual Review

## Notes for AI Test Generator
This feature is highly dynamic. Do not rely on specific CSS classes or IDs. Use natural language or semantic locators.
