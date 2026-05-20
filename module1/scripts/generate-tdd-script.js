require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

async function generateTestScript() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Error: Please provide the path to a Jira markdown file.");
        console.error("Usage: node scripts/generate-tdd-script.js jira-tickets/JIRA-1024-Loan-Calculator.md");
        process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error("===============================================================");
        console.error("⚠️  ERROR: OPENAI_API_KEY is missing from your .env file!");
        console.error("To use the True AI Generator pipeline, please add your OpenAI");
        console.error("API key to the .env file in the module1 directory.");
        console.error("===============================================================");
        process.exit(1);
    }

    const jiraFilePath = path.resolve(__dirname, '..', args[0]);
    if (!fs.existsSync(jiraFilePath)) {
        console.error(`Error: File not found at ${jiraFilePath}`);
        process.exit(1);
    }

    console.log(`Initiating Agentic Test Generation Pipeline for: ${path.basename(jiraFilePath)}`);
    console.log("Connecting to LLM and synthesizing test script...");

    const markdownContent = fs.readFileSync(jiraFilePath, 'utf8');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are an expert QA Automation Architect.
Your task is to read a Jira Acceptance Criteria markdown file and generate a fully functional Playwright test script.
You MUST use the '@zerostep/playwright' library for ALL browser interactions.
Do NOT use traditional locators like page.locator() or page.getByRole().

Use this format for actions:
await ai('Enter [value] into the [field name]', { page, test });
await ai('Click the [button name]', { page, test });

Use this format for assertions:
const result = await ai('Is the [state] [expected value]?', { page, test });
expect(result).toBe(true);

Your output must be ONLY the raw Javascript code. Do not wrap it in \`\`\`javascript or markdown blocks. Do not add any conversational text.

The script must be structured exactly like this:
const { test, expect } = require('@playwright/test');
const { ai } = require('@zerostep/playwright');
const path = require('path');

test.describe('Auto-Generated Agentic TDD: ${path.basename(jiraFilePath)}', () => {
    test('Validate Acceptance Criteria', async ({ page }) => {
        if (!process.env.ZEROSTEP_TOKEN) { test.skip(); return; }
        const appPath = \`file://\${path.resolve(__dirname, '../app/index.html')}\`;
        await page.goto(appPath);
        console.log("Executing AI agent script derived from Jira...");
        // YOUR AI COMMANDS HERE
        console.log("Feature complete. Acceptance criteria successfully validated.");
    });
});
`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Here is the Jira ticket:\n\n${markdownContent}` }
            ],
            temperature: 0.1,
        });

        let generatedCode = response.choices[0].message.content.trim();
        
        // Safety cleanup just in case the LLM ignored instructions and returned markdown
        if (generatedCode.startsWith('```javascript')) {
            generatedCode = generatedCode.replace(/^```javascript\n/, '').replace(/\n```$/, '');
        } else if (generatedCode.startsWith('```')) {
            generatedCode = generatedCode.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        const outputFilename = `05-${path.basename(jiraFilePath, '.md').toLowerCase()}-auto.spec.js`;
        const outputPath = path.join(__dirname, '../tests', outputFilename);

        fs.writeFileSync(outputPath, generatedCode);
        
        console.log(`Success: True LLM Test script generated at tests/${outputFilename}`);
        console.log(`Execution Command: npx playwright test tests/${outputFilename}`);
    } catch (error) {
        console.error("Error communicating with OpenAI:", error.message);
        process.exit(1);
    }
}

generateTestScript();
