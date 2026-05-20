const fs = require('fs');
const path = require('path');

function generateTestScript() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Error: Please provide the path to a Jira markdown file.");
        console.error("Usage: node scripts/generate-tdd-script.js jira-tickets/JIRA-1024-Loan-Calculator.md");
        process.exit(1);
    }

    const jiraFilePath = path.resolve(__dirname, '..', args[0]);
    
    if (!fs.existsSync(jiraFilePath)) {
        console.error(`Error: File not found at ${jiraFilePath}`);
        process.exit(1);
    }

    console.log(`Initiating Agentic Test Generation Pipeline for: ${path.basename(jiraFilePath)}`);
    console.log("Parsing Acceptance Criteria...");

    const content = fs.readFileSync(jiraFilePath, 'utf8');
    const lines = content.split('\n');

    let isParsingCriteria = false;
    const aiCommands = [];
    let expectedResultCommand = '';

    // Dynamically parse the natural language from the Jira Acceptance Criteria
    for (const line of lines) {
        if (line.trim().startsWith('## Acceptance Criteria')) {
            isParsingCriteria = true;
            continue;
        }

        if (isParsingCriteria) {
            if (line.trim().startsWith('##')) break;

            let text = line.trim();
            // Remove bullet points and asterisks for easier parsing
            text = text.replace(/^-\s*/, '').replace(/\*/g, '').trim();
            if (!text) continue;

            if (text.toLowerCase().startsWith('when ') || text.toLowerCase().startsWith('and ')) {
                // E.g., "When the user enters 50000 into the requested loan amount field"
                const actionMatch = text.match(/^(When|And)\s+(.*)/i);
                if (actionMatch && actionMatch[2]) {
                    const action = actionMatch[2].replace(/they /i, '').replace(/the user /i, '').trim();
                    const formattedAction = action.charAt(0).toUpperCase() + action.slice(1);
                    aiCommands.push(`        await ai('${formattedAction}', { page, test });`);
                }
            } else if (text.toLowerCase().startsWith('then ')) {
                // E.g., "Then the system should display an eligibility status of Pre-Approved"
                // Extract everything after "Then "
                const assertion = text.substring(5).replace(/the system should display /i, '').trim();
                expectedResultCommand = `        const result = await ai('Is ${assertion}?', { page, test });\n        expect(result).toBe(true);`;
            }
        }
    }

    if (aiCommands.length === 0) {
        console.error("Error: Failed to parse clear 'When/And' actions from the Acceptance Criteria.");
        process.exit(1);
    }

    console.log("Synthesizing ZeroStep Natural Language Playwright Script from parsed criteria...");

    const outputFilename = `05-${path.basename(jiraFilePath, '.md').toLowerCase()}-auto.spec.js`;
    const outputPath = path.join(__dirname, '../tests', outputFilename);

    const scriptTemplate = `const { test, expect } = require('@playwright/test');
const { ai } = require('@zerostep/playwright');
const path = require('path');

/**
 * ============================================================================
 * AUTO-GENERATED SCRIPT VIA AGENTIC TDD PIPELINE
 * Source: ${path.basename(jiraFilePath)}
 * Generated At: ${new Date().toISOString()}
 * ============================================================================
 */

test.describe('Auto-Generated Shift-Left Agentic TDD: ${path.basename(jiraFilePath)}', () => {
    test('Calculate loan eligibility based on dynamic Jira criteria', async ({ page }) => {
        if (!process.env.ZEROSTEP_TOKEN) {
            test.skip();
            return;
        }

        const appPath = \`file://\${path.resolve(__dirname, '../app/index.html')}\`;
        await page.goto(appPath);

        console.log("Executing dynamic AI agent script derived from Acceptance Criteria...");

${aiCommands.join('\n')}

${expectedResultCommand}

        console.log("Feature complete. Acceptance criteria successfully validated.");
    });
});
`;

    fs.writeFileSync(outputPath, scriptTemplate);
    
    console.log(`Success: Test script generated at tests/${outputFilename}`);
    console.log(`Execution Command: npx playwright test tests/${outputFilename}`);
}

generateTestScript();
