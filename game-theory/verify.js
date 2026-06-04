const { fork } = require("child_process");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ARTIFACT_DIR = "/Users/aaryankumar/.gemini/antigravity-ide/brain/b01700d4-9e34-450f-a6c7-b7d5d0ef3e5f";
const LOG_FILE_PATH = path.join(ARTIFACT_DIR, "simulation_audit_log.json");

// Helper to wait
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runSimulation() {
    console.log("==============================================================");
    console.log("INITIALIZING AUTOMATED CRYPTOECONOMIC SIMULATION LOOP");
    console.log("==============================================================");

    // 1. Start the simulation server in-process
    console.log("[System] Launching local Express backend server...");
    const serverProcess = fork("server.js", [], { stdio: "inherit" });

    // Wait for Solidity compilation, contract deployment, and Express startup
    console.log("[System] Waiting 10 seconds for contract compilation & deployment...");
    await delay(10000);

    // 2. Launch headless browser
    console.log("[Playwright] Launching Chromium instance...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Set a large viewport for high-quality screenshots
    await page.setViewportSize({ width: 1400, height: 950 });

    const auditLogs = {
        timestamp: new Date().toISOString(),
        scenarios: []
    };

    try {
        console.log("[Playwright] Navigating to simulation dashboard...");
        await page.goto("http://localhost:3000");
        await delay(2000);

        // Fetch initial contract address
        const contractBadgeText = await page.textContent("#contractAddr");
        console.log(`[Ledger] Deployed Contract: ${contractBadgeText}`);

        // ======================================================================
        // SCENARIO 1: Staking Mechanism Validation
        // ======================================================================
        console.log("\n--- STARTING SCENARIO 1: Staking Mechanism Validation ---");
        
        // Register nodes 1, 2, 3, 4, 5 by staking 10 ETH each
        for (let i = 1; i <= 5; i++) {
            console.log(`[Scenario 1] Staking 10 ETH for Node ${i}...`);
            // Find the button in the row for Node i
            // The table row for Node i has text "Node i" and a button "Stake 10 ETH"
            const stakeButton = page.locator(`tr:has-text("Node ${i}") button:has-text("Stake 10 ETH")`);
            await stakeButton.click();
            await delay(1500); // Wait for block mining
        }

        // Query state to verify staking
        const activeValidators = await page.textContent("#activeValidatorsVal");
        const totalLockedCollateral = await page.textContent("#totalLockedVal");
        console.log(`[Scenario 1 Status] Active Validators: ${activeValidators}`);
        console.log(`[Scenario 1 Status] Total Contract Vault Balance: ${totalLockedCollateral}`);

        // Parse metrics for audit logs
        const scenario1Log = {
            name: "Scenario 1: Staking Mechanism Validation",
            success: activeValidators.includes("5 / 5") && totalLockedCollateral.includes("50.00 ETH"),
            initialState: {
                activeValidators,
                totalLockedCollateral
            }
        };
        auditLogs.scenarios.push(scenario1Log);
        console.log(`[Scenario 1 Audit] Staking validation: ${scenario1Log.success ? "PASSED" : "FAILED"}`);

        // ======================================================================
        // SCENARIO 2: Automated Enforcement - Programmatic Slashing
        // ======================================================================
        console.log("\n--- STARTING SCENARIO 2: Programmatic Slashing Conditions ---");

        // Select Node 2 to submit malicious data
        console.log("[Scenario 2] Selecting Node 2 to submit invalid data payload...");
        await page.selectOption("#selectNodeSubmit", "2");
        await delay(500);

        console.log("[Scenario 2] Node 2 submitting corrupted data payload...");
        await page.click("#btnSubmitMalicious");
        await delay(2000); // Wait for block transaction to record

        // Verify auditor dispute button is enabled
        const isDisputeEnabled = await page.isEnabled("#btnDisputeSlash");
        console.log(`[Scenario 2] Auditor Dispute Button Enabled: ${isDisputeEnabled}`);

        // Take screenshot before slashing
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "scenario2_pre_slash.png") });

        console.log("[Scenario 2] Auditor Bot triggering dispute challenge on smart contract...");
        await page.click("#btnDisputeSlash");
        await delay(2000); // Wait for slashing block transaction

        // Verify node status has changed to Slashed
        const node2Status = await page.textContent(`tr:has-text("Node 2") .node-status-badge`);
        const node2LockedStake = await page.textContent(`tr:has-text("Node 2") td:nth-child(3)`);
        const auditorBalance = await page.textContent("#auditorBalanceVal");
        
        console.log(`[Scenario 2 Status] Node 2 State after dispute: ${node2Status}`);
        console.log(`[Scenario 2 Status] Node 2 Locked Stake: ${node2LockedStake}`);
        console.log(`[Scenario 2 Status] Auditor Wallet Balance: ${auditorBalance}`);

        const scenario2Log = {
            name: "Scenario 2: Programmatic Slashing Conditions",
            success: node2Status.trim() === "Slashed" && node2LockedStake.includes("0.00 ETH") && parseFloat(auditorBalance) > 100.0,
            stateAfterSlash: {
                node2Status: node2Status.trim(),
                node2LockedStake: node2LockedStake.trim(),
                auditorBalance: auditorBalance.trim()
            }
        };
        auditLogs.scenarios.push(scenario2Log);
        console.log(`[Scenario 2 Audit] Slashing validation: ${scenario2Log.success ? "PASSED" : "FAILED"}`);

        // Save screenshot of slashed state
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "scenario2_slashed.png") });
        console.log("[Scenario 2] Saved screenshot to scenario2_slashed.png");

        // ======================================================================
        // SCENARIO 3: Collusion Vectors and Cost of Corruption
        // ======================================================================
        console.log("\n--- STARTING SCENARIO 3: Collusion & Cost of Corruption ---");

        // 1. Modify PfC to 60 ETH to make system economically vulnerable (CoC = 30 ETH, PfC = 60 ETH)
        console.log("[Scenario 3] Modifying Profit from Corruption (PfC) to 60 ETH...");
        await page.fill("#pfcVal", "60");
        await page.dispatchEvent("#pfcVal", "change");
        await delay(1500);

        const securityRatio = await page.textContent("#secRatioVal");
        const securityStatus = await page.textContent("#secStatusText");
        console.log(`[Scenario 3 Monitor] Security Ratio: ${securityRatio} (${securityStatus})`);

        // 2. Trigger collusion price reports ($180)
        console.log("[Scenario 3] Simulating 51% Cartel Collusion price reporting...");
        await page.click("#btnTriggerCollusion");
        await delay(3000);

        // 3. Trigger consensus aggregation
        console.log("[Scenario 3] Aggregating consensus price on smart contract...");
        await page.click("#btnAggregate");
        await delay(2000);

        // Verify circuit breaker triggered
        const circuitBreakerActive = await page.evaluate(() => document.body.classList.contains("halted"));
        const alertBannerVisible = await page.isVisible("#circuitBreakerAlert");
        console.log(`[Scenario 3 Status] Circuit Breaker Active in UI: ${circuitBreakerActive}`);
        console.log(`[Scenario 3 Status] Red System Alert Banner Visible: ${alertBannerVisible}`);

        const scenario3Log = {
            name: "Scenario 3: Collusion & Cost of Corruption",
            success: circuitBreakerActive && alertBannerVisible,
            securityMonitor: {
                securityRatio,
                securityStatus,
                circuitBreakerActive
            }
        };
        auditLogs.scenarios.push(scenario3Log);
        console.log(`[Scenario 3 Audit] Collusion protection: ${scenario3Log.success ? "PASSED" : "FAILED"}`);

        // Save screenshot of circuit breaker state
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "scenario3_circuit_breaker.png") });
        console.log("[Scenario 3] Saved screenshot to scenario3_circuit_breaker.png");

    } catch (err) {
        console.error("[Playwright Execution Error]:", err);
    } finally {
        // Write the log report to the artifacts directory
        fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(auditLogs, null, 2));
        console.log(`\n[System] Written cryptographic state logs to: ${LOG_FILE_PATH}`);

        console.log("[System] Tearing down simulation environment...");
        await browser.close();
        serverProcess.kill();
        process.exit(0);
    }
}

runSimulation();
