const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Semantic / Self-Healing Automation', () => {
    test('Calculate loan eligibility via Accessibility Tree locators', async ({ page }) => {
        const appPath = `file://${path.resolve(__dirname, '../app/index.html')}`;
        await page.goto(appPath);

        // Simulate UI mutation to test locator resilience against structural DOM changes
        console.log("Activating UI structural modification (Chaos Mode)");
        await page.locator('text=Simulate UI Update (Chaos Mode)').click();

        console.log("Executing form submission via Semantic Accessibility Locators");
        
        // Utilize the Accessibility Tree for robust, self-healing element targeting
        await page.getByRole('spinbutton', { name: 'Requested Loan Amount' }).fill('75000');
        await page.getByRole('spinbutton', { name: 'Tenure in Years' }).fill('15');
        await page.getByRole('spinbutton', { name: 'Monthly Income' }).fill('9000');
        
        await page.getByRole('button', { name: 'Calculate Eligibility' }).click();

        // Validate result state via semantic heading
        const resultHeading = page.getByRole('heading', { name: 'Eligibility Status' });
        await expect(resultHeading).toBeVisible();
        
        // Validate explicit text node containment
        await expect(page.locator('.result-card')).toContainText('Pre-Approved');
        console.log("Test Passed: Semantic locators resolved successfully across mutated DOM structure.");
    });
});
