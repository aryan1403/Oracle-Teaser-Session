const { test, expect } = require('@playwright/test');
const { ai } = require('@zerostep/playwright');
const path = require('path');

test.describe('Payment Clearing Ledger - AI Agent Verification', () => {
    test('Verify transaction rollback safely using ZeroStep AI Agent', async ({ page }) => {
        if (!process.env.ZEROSTEP_TOKEN) {
            test.skip();
            return;
        }

        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;

        // Intercept network and force connection failure
        await page.route('**/api/clear-payment', async (route) => {
            await route.abort('connectionfailed');
        });

        await page.goto(appPath);

        // ZeroStep handles the sequence of interactions via natural language commands
        await ai('Type 250.00 into the Amount to Transfer input', { page, test });
        await ai('Click the Confirm Transfer button', { page, test });

        // ZeroStep verifies complex visual state of the ledger and asserts status
        const isRolledBack = await ai('Is the transaction state showing as Transaction Rolled Back?', { page, test });
        expect(isRolledBack).toBe(true);

        const isReconciled = await ai('Is the ledger lock status showing as Unlocked (Reconciled)?', { page, test });
        expect(isReconciled).toBe(true);

        const originalBalanceRestored = await ai('Is the sender balance showing as $1000.00?', { page, test });
        expect(originalBalanceRestored).toBe(true);
    });
});
