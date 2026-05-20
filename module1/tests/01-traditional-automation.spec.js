const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Baseline Automation (CSS/XPath Selectors)', () => {
    test('Calculate loan eligibility via static element locators', async ({ page }) => {
        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        await page.goto(appPath);

        // Optional: Trigger structural DOM mutation to test locator resilience
        // await page.locator('#chaos-btn').click();

        console.log("Executing form submission via static DOM selectors");
        
        // Execute input via static ID selectors
        await page.locator('#loan-amount').fill('75000');
        await page.locator('#loan-tenure').fill('15');
        await page.locator('#monthly-income').fill('9000');
        
        await page.locator('#calculate-btn').click();

        // Validate expected state
        const result = page.locator('#eligibility-result');
        await expect(result).toBeVisible();
        await expect(result).toHaveText('Pre-Approved');
    });
});
