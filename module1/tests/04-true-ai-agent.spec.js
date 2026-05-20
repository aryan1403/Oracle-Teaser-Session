const { test, expect } = require('@playwright/test');
const { ai } = require('@zerostep/playwright');
const path = require('path');

test.describe('True AI Agent Automation (ZeroStep)', () => {
    // Requires ZEROSTEP_TOKEN environment variable configuration
    test('Execute loan assessment workflow via natural language processing', async ({ page }) => {
        if (!process.env.ZEROSTEP_TOKEN) {
            console.log("WARN: Skipping execution - ZEROSTEP_TOKEN is not configured.");
            test.skip();
            return;
        }

        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        await page.goto(appPath);

        // Simulate structural DOM mutation
        await page.locator('text=Simulate UI Update (Chaos Mode)').click();
        console.log("Executing ZeroStep AI actions via natural language instructions...");

        // Execute sequential state modifications via AI agent
        await ai('Enter 80000 into the requested loan amount field', { page, test });
        await ai('Enter 20 into the tenure field', { page, test });
        await ai('Enter 12000 into the monthly income field', { page, test });
        
        await ai('Click the calculate eligibility button', { page, test });

        // Assert dynamic state changes via AI assessment
        const isApproved = await ai('Is the eligibility status showing as Pre-Approved?', { page, test });
        expect(isApproved).toBe(true);

        console.log("Validation complete: AI Agent successfully executed instructions.");
    });
});
