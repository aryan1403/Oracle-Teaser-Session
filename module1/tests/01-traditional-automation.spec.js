const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Traditional Automation (Brittle)', () => {
    test('Calculate loan eligibility using hardcoded IDs and CSS selectors', async ({ page }) => {
        // Load the local app
        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        await page.goto(appPath);

        // --- Demo Step: Trigger Chaos Mode (UI Update) ---
        // Uncomment the next line to demonstrate how traditional scripts break when the frontend changes.
        // await page.locator('#chaos-btn').click();

        console.log("Filling form using hardcoded selectors like '#loan-amount'");
        
        // Traditional scripts use CSS selectors and IDs which break easily
        await page.locator('#loan-amount').fill('75000');
        await page.locator('#loan-tenure').fill('15');
        await page.locator('#monthly-income').fill('9000');
        
        // This button class or ID might change in a release
        await page.locator('#calculate-btn').click();

        // Verify result
        const result = page.locator('#eligibility-result');
        await expect(result).toBeVisible();
        await expect(result).toHaveText('Pre-Approved');
    });
});
