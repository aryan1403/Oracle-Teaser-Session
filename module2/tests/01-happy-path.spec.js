const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Payment Clearing Ledger - Happy Path', () => {
    test('Verify successful transaction execution and balance commitment', async ({ page }) => {
        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        
        // Mock successful clearing house response
        await page.route('**/api/clear-payment', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'settled', transactionId: 'TXN-9021-SUCCESS' })
            });
        });

        await page.goto(appPath);

        // Fill out transfer amount
        await page.locator('#transfer-amount').fill('150.00');
        
        // Submit transfer
        await page.locator('#transfer-submit-btn').click();

        // Verify balance adjustments
        const senderBalance = page.locator('#sender-balance');
        const recipientBalance = page.locator('#recipient-balance');

        await expect(senderBalance).toHaveText('$850.00');
        await expect(recipientBalance).toHaveText('$650.00');

        // Verify ledger status
        const transactionState = page.locator('#transaction-state');
        const ledgerLock = page.locator('#ledger-lock-status');

        await expect(transactionState).toHaveText('Cleared & Settled');
        await expect(ledgerLock).toHaveText('Unlocked');
    });
});
