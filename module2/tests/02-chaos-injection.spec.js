const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Payment Clearing Ledger - Chaos Engineering', () => {
    const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;

    test('Verify ledger rollback on rate limiting (HTTP 429)', async ({ page }) => {
        // Intercept API to return 429 Too Many Requests
        await page.route('**/api/clear-payment', async (route) => {
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Rate limit exceeded' })
            });
        });

        await page.goto(appPath);

        // Input transfer amount
        await page.locator('#transfer-amount').fill('200.00');
        await page.locator('#transfer-submit-btn').click();

        // Verify sender balance is rolled back to original $1000.00
        const senderBalance = page.locator('#sender-balance');
        const recipientBalance = page.locator('#recipient-balance');
        
        await expect(senderBalance).toHaveText('$1000.00');
        await expect(recipientBalance).toHaveText('$500.00');

        // Validate error state
        const transactionState = page.locator('#transaction-state');
        const errorAlert = page.locator('#error-alert');
        
        await expect(transactionState).toHaveText('Transaction Rolled Back');
        await expect(errorAlert).toBeVisible();
        await expect(errorAlert).toContainText('Clearing House Rejected Transaction: Status 429');
    });

    test('Verify ledger rollback on connection failure (Network Dropped)', async ({ page }) => {
        // Abort the API request completely mid-transit to simulate network drop
        await page.route('**/api/clear-payment', async (route) => {
            await route.abort('connectionfailed');
        });

        await page.goto(appPath);

        // Input transfer amount
        await page.locator('#transfer-amount').fill('300.00');
        await page.locator('#transfer-submit-btn').click();

        // Verify balances rolled back correctly
        const senderBalance = page.locator('#sender-balance');
        const recipientBalance = page.locator('#recipient-balance');

        await expect(senderBalance).toHaveText('$1000.00');
        await expect(recipientBalance).toHaveText('$500.00');

        // Confirm ledger indicates rollback safety
        const transactionState = page.locator('#transaction-state');
        const ledgerLock = page.locator('#ledger-lock-status');

        await expect(transactionState).toHaveText('Transaction Rolled Back');
        await expect(ledgerLock).toHaveText('Unlocked (Reconciled)');
    });
});
