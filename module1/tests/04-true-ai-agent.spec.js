const { test, expect } = require('@playwright/test');
const { ai } = require('@zerostep/playwright');
const path = require('path');

test.describe('True AI Agent Automation (ZeroStep)', () => {
    // Note: This requires a ZEROSTEP_TOKEN environment variable set.
    // If it's not set, this test will skip or fail, but it serves as code documentation
    // of how an AI agent operates in Playwright.
    
    test('Calculate loan using natural language prompts', async ({ page }) => {
        if (!process.env.ZEROSTEP_TOKEN) {
            console.log("⚠️ Skipping True AI test: ZEROSTEP_TOKEN is not set. Get one at zerostep.com to run this locally.");
            test.skip();
            return;
        }

        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        await page.goto(appPath);

        // Turn on chaos mode to scramble everything
        await page.locator('text=Simulate UI Update (Chaos Mode)').click();
        console.log("Executing AI actions via natural language processing...");

        // Execute natural language instructions via AI agent
        await ai('Enter 80000 into the requested loan amount field', { page, test });
        await ai('Enter 20 into the tenure field', { page, test });
        await ai('Enter 12000 into the monthly income field', { page, test });
        
        await ai('Click the calculate eligibility button', { page, test });

        // Assert the expected outcome via AI assessment
        const isApproved = await ai('Is the eligibility status showing as Pre-Approved?', { page, test });
        expect(isApproved).toBe(true);

        console.log("AI Agent successfully executed the workflow using natural language capabilities.");
    });
});
