# JIRA-1024: Dynamic Loan Eligibility Calculator

**Epic:** Core Banking Portal Revamp
**Assignee:** Frontend Team
**Status:** In Progress

## User Story
As a banking customer, I want to be able to input my requested loan amount, desired tenure, and monthly income so that I can instantly see if I am pre-approved for the loan.

## Acceptance Criteria
- **Scenario 1: Successful Pre-Approval**
  - **Given** the user navigates to the Loan Eligibility Calculator
  - **When** they enter `50000` into the Requested Loan Amount field
  - **And** they enter `10` into the Tenure (Years) field
  - **And** they enter `5000` into the Monthly Income field
  - **And** they click the "Calculate Eligibility" button
  - **Then** the system should display an eligibility status of "Pre-Approved"

## Notes for AI Test Generator
This feature is highly dynamic. Do not rely on specific CSS classes or IDs as the frontend team frequently updates the DOM structure. Use natural language or semantic locators.
