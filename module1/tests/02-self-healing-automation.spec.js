const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('AI-Driven / Self-Healing Automation', () => {
    test('Calculate loan eligibility using Accessibility Tree Locators', async ({ page }) => {
        // Load the local app
        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        await page.goto(appPath);

        // --- Demo Step: Trigger Chaos Mode (UI Update) ---
        // We activate the chaos mode which scrambles all IDs and classes.
        // The traditional script failed here, but watch this one heal itself.
        console.log("Activating UI structural modification (Simulating Frontend Release)");
        await page.locator('text=Simulate UI Update (Chaos Mode)').click();

        console.log("Filling form using Semantic / Accessibility Locators");
        
        // By relying on the Accessibility Tree (roles and names), we become immune to CSS/ID changes.
        // The AI-driven locators "understand" the page structure semantically.
        await page.getByRole('spinbutton', { name: 'Requested Loan Amount' }).fill('75000');
        await page.getByRole('spinbutton', { name: 'Tenure in Years' }).fill('15');
        await page.getByRole('spinbutton', { name: 'Monthly Income' }).fill('9000');
        
        // The button might be deeply nested in randomized divs, but it's still a "Calculate Eligibility" button.
        await page.getByRole('button', { name: 'Calculate Eligibility' }).click();

        // Verifying the result by looking for the heading instead of specific IDs
        const resultHeading = page.getByRole('heading', { name: 'Eligibility Status' });
        await expect(resultHeading).toBeVisible();
        
        // Verify the success text is somewhere near the result
        await expect(page.locator('.result-card')).toContainText('Pre-Approved');
        console.log("Test Passed successfully despite completely scrambled DOM architecture.");
    });
});
