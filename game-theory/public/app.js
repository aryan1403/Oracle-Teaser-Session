// State Management
let currentSimulationState = null;
let nodeWithPendingDispute = null; // Stores { nodeIndex, data } when fraud is submitted
let logsQueue = [];

// DOM Elements
const contractAddrEl = document.getElementById("contractAddr");
const currentEpochValEl = document.getElementById("currentEpochVal");
const lastPriceValEl = document.getElementById("lastPriceVal");
const totalLockedValEl = document.getElementById("totalLockedVal");
const activeValidatorsValEl = document.getElementById("activeValidatorsVal");
const nodesTableBodyEl = document.getElementById("nodesTableBody");
const dataLogsEl = document.getElementById("dataLogs");
const selectNodeSubmitEl = document.getElementById("selectNodeSubmit");
const btnSubmitHonestEl = document.getElementById("btnSubmitHonest");
const btnSubmitMaliciousEl = document.getElementById("btnSubmitMalicious");
const auditorAddressValEl = document.getElementById("auditorAddressVal");
const auditorBalanceValEl = document.getElementById("auditorBalanceVal");
const btnDisputeSlashEl = document.getElementById("btnDisputeSlash");
const cocValEl = document.getElementById("cocVal");
const pfcValEl = document.getElementById("pfcVal");
const secRatioValEl = document.getElementById("secRatioVal");
const secRatioIndicatorEl = document.getElementById("secRatioIndicator");
const secStatusTextEl = document.getElementById("secStatusText");
const priceReportsContainerEl = document.getElementById("priceReportsContainer");
const btnRunHonestEpochEl = document.getElementById("btnRunHonestEpoch");
const btnTriggerCollusionEl = document.getElementById("btnTriggerCollusion");
const btnAggregateEl = document.getElementById("btnAggregate");
const btnResetSimulationEl = document.getElementById("btnResetSimulation");
const simulationEventLogEl = document.getElementById("simulationEventLog");
const circuitBreakerAlertEl = document.getElementById("circuitBreakerAlert");

// Add log entry to the UI simulation feed
function logEvent(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.className = `feed-line`;
    line.innerHTML = `<span style="color: #64748b;">[${timestamp}]</span> <span class="${type === 'danger' ? 'danger-text' : ''}">${message}</span>`;
    
    // Custom styling for error log lines
    if (type === 'danger') {
        line.style.color = '#ef4444';
    } else if (type === 'success') {
        line.style.color = '#10b981';
    } else if (type === 'warning') {
        line.style.color = '#f59e0b';
    }
    
    simulationEventLogEl.appendChild(line);
    simulationEventLogEl.scrollTop = simulationEventLogEl.scrollHeight;
}

// Fetch ledger state from the backend
async function fetchState() {
    try {
        const res = await fetch("/api/state");
        const state = await res.json();
        
        if (state.error) {
            console.error("Error in state fetch:", state.error);
            return;
        }

        currentSimulationState = state;
        updateUI(state);
    } catch (err) {
        console.error("Error connecting to simulation backend:", err);
    }
}

// Update DOM elements with new state
function updateUI(state) {
    // Contract & Global metrics
    contractAddrEl.innerText = `CONTRACT: ${state.contractAddress.substring(0, 10)}...${state.contractAddress.substring(38)}`;
    currentEpochValEl.innerText = state.currentEpoch;
    lastPriceValEl.innerText = `$${state.lastConsensusPrice}`;
    totalLockedValEl.innerText = `${state.totalLockedBalance.toFixed(2)} ETH`;
    activeValidatorsValEl.innerText = `${state.activeValidatorCount} / 5`;

    // Auditor Info
    auditorAddressValEl.innerText = `${state.auditor.address.substring(0, 8)}...${state.auditor.address.substring(36)}`;
    auditorBalanceValEl.innerText = `${state.auditor.walletBalance.toFixed(2)} ETH`;

    // Cost of Corruption vs Profit from Corruption
    cocValEl.innerText = `${state.coc} ETH`;
    const pfc = parseFloat(pfcValEl.value) || 0;
    
    // Security Ratio
    const ratio = state.coc > 0 && pfc > 0 ? (state.coc / pfc) : 0;
    const ratioPercent = Math.round(ratio * 100);
    secRatioValEl.innerText = `${ratioPercent}%`;

    // Security Status Indicator
    secRatioIndicatorEl.className = "security-dot";
    secStatusTextEl.className = "security-status-text";
    
    if (ratio >= 1.5) {
        secRatioIndicatorEl.classList.add("green");
        secStatusTextEl.innerText = "SECURE";
        secStatusTextEl.classList.add("safe");
    } else if (ratio >= 1.0) {
        secRatioIndicatorEl.classList.add("orange");
        secStatusTextEl.innerText = "VULNERABLE (CoC ≥ PfC)";
        secStatusTextEl.classList.add("vulnerable");
    } else {
        secRatioIndicatorEl.classList.add("red");
        secStatusTextEl.innerText = "ECONOMICALLY BREACHED (CoC < PfC)";
        secStatusTextEl.classList.add("breached");
    }

    // Nodes Table
    nodesTableBodyEl.innerHTML = "";
    state.nodes.forEach(node => {
        const tr = document.createElement("tr");
        
        let statusBadge = "";
        let actionBtn = "";
        
        if (node.isSlashed) {
            statusBadge = `<span class="node-status-badge slashed">Slashed</span>`;
            actionBtn = `<span style="color: #ef4444; font-size: 0.7rem; font-weight:600;">Revoked</span>`;
        } else if (node.isRegistered) {
            statusBadge = `<span class="node-status-badge active">Active</span>`;
            actionBtn = `<span style="color: #10b981; font-size: 0.7rem; font-weight:600;">Staked</span>`;
        } else {
            statusBadge = `<span class="node-status-badge inactive">Inactive</span>`;
            actionBtn = `<button class="btn btn-primary" onclick="stakeCollateral(${node.index})">Stake 10 ETH</button>`;
        }

        tr.innerHTML = `
            <td><strong>Node ${node.index}</strong><br><span class="node-addr">${node.address.substring(0, 6)}...</span></td>
            <td>${node.walletBalance.toFixed(2)} ETH</td>
            <td>${node.lockedStake.toFixed(2)} ETH</td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
        `;
        nodesTableBodyEl.appendChild(tr);
    });

    // Oracle pricing reported card grid
    priceReportsContainerEl.innerHTML = "";
    if (state.currentEpochSubmissions.length === 0) {
        priceReportsContainerEl.innerHTML = `<div class="price-card-placeholder">No prices reported in the current epoch. Run a simulation scenario.</div>`;
    } else {
        state.nodes.forEach(node => {
            if (!node.isRegistered) return;
            
            const sub = state.currentEpochSubmissions.find(s => s.address.toLowerCase() === node.address.toLowerCase());
            
            const card = document.createElement("div");
            card.className = `price-card ${sub ? 'reported' : ''} ${node.isSlashed ? 'slashed-state' : ''}`;
            
            card.innerHTML = `
                <span class="price-card-label">Node ${node.index}</span>
                <span class="price-card-val">${node.isSlashed ? 'Revoked' : (sub ? `$${sub.price}` : 'Pending')}</span>
            `;
            priceReportsContainerEl.appendChild(card);
        });
    }

    // Circuit Breaker State Overlay
    if (state.circuitBreakerActive) {
        document.body.classList.add("halted");
        circuitBreakerAlertEl.classList.remove("hidden");
        disableInteractionButtons();
    } else {
        document.body.classList.remove("halted");
        circuitBreakerAlertEl.classList.add("hidden");
        enableInteractionButtons();
    }
}

function disableInteractionButtons() {
    btnSubmitHonestEl.disabled = true;
    btnSubmitMaliciousEl.disabled = true;
    btnDisputeSlashEl.disabled = true;
    btnRunHonestEpochEl.disabled = true;
    btnTriggerCollusionEl.disabled = true;
    btnAggregateEl.disabled = true;
}

function enableInteractionButtons() {
    btnSubmitHonestEl.disabled = false;
    btnSubmitMaliciousEl.disabled = false;
    btnRunHonestEpochEl.disabled = false;
    btnTriggerCollusionEl.disabled = false;
    
    // Keep dispute disabled unless we have active fraud pending dispute
    if (nodeWithPendingDispute) {
        btnDisputeSlashEl.disabled = false;
    } else {
        btnDisputeSlashEl.disabled = true;
    }

    // Enable aggregate if we have enough submissions
    if (currentSimulationState && currentSimulationState.currentEpochSubmissions.length >= 3) {
        btnAggregateEl.disabled = false;
    } else {
        btnAggregateEl.disabled = true;
    }
}

// Actions API Calls
async function stakeCollateral(nodeIndex) {
    try {
        logEvent(`[Scenario 1] Initiating staking tx for Node ${nodeIndex}...`, "info");
        const res = await fetch("/api/stake", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeIndex })
        });
        const data = await res.json();
        
        if (data.error) {
            logEvent(`Staking failed: ${data.error}`, "danger");
        } else {
            logEvent(`[Scenario 1] Node ${nodeIndex} staked 10.00 ETH. Tx: ${data.txHash.substring(0, 15)}...`, "success");
            fetchState();
        }
    } catch (err) {
        logEvent(`Network error during staking: ${err.message}`, "danger");
    }
}

// Scenario 2 Data Submission simulation
async function submitDataPayload(isMalicious) {
    const nodeIndex = parseInt(selectNodeSubmitEl.value);
    
    // Check if node is registered
    const node = currentSimulationState.nodes[nodeIndex - 1];
    if (!node.isRegistered || node.isSlashed) {
        logEvent(`Error: Selected Node ${nodeIndex} must be active and staked to submit data.`, "warning");
        return;
    }

    const payloadText = isMalicious 
        ? `MALICIOUS_PAYLOAD_FRAUD_DETECTED_0x${Math.random().toString(16).substring(2, 6)}` 
        : `TRANSACTION_DATA_PAYLOAD_OK_0x${Math.random().toString(16).substring(2, 6)}`;

    try {
        logEvent(`[Scenario 2] Node ${nodeIndex} submitting data: "${payloadText}"`, "info");
        const res = await fetch("/api/submit-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeIndex, data: payloadText })
        });
        const data = await res.json();

        if (data.error) {
            logEvent(`Data submission failed: ${data.error}`, "danger");
        } else {
            logEvent(`[Scenario 2] Data recorded on ledger. Tx: ${data.txHash.substring(0, 15)}...`, "success");
            
            // Add to UI data log display
            const logLine = document.createElement("div");
            logLine.className = `terminal-line ${isMalicious ? 'warning' : ''}`;
            logLine.innerHTML = `<strong>Node ${nodeIndex}:</strong> ${payloadText} (Hash: ${node.isRegistered ? 'keccak256...' : ''})`;
            
            if (dataLogsEl.querySelector(".placeholder")) {
                dataLogsEl.innerHTML = "";
            }
            dataLogsEl.appendChild(logLine);
            dataLogsEl.scrollTop = dataLogsEl.scrollHeight;

            if (isMalicious) {
                nodeWithPendingDispute = { nodeIndex, data: payloadText };
                btnDisputeSlashEl.disabled = false;
                logEvent(`[Auditor Bot] ⚠️ Fraud detected! Staked Node ${nodeIndex} submitted corrupted payload. Auditor is ready to dispute.`, "warning");
            }

            fetchState();
        }
    } catch (err) {
        logEvent(`Data submission error: ${err.message}`, "danger");
    }
}

// Trigger Auditor Challenge & Slash
async function triggerDisputeSlash() {
    if (!nodeWithPendingDispute) return;
    const { nodeIndex, data: rawData } = nodeWithPendingDispute;
    
    try {
        logEvent(`[Scenario 2] Auditor bot submitting dispute proof to smart contract...`, "warning");
        const res = await fetch("/api/dispute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeIndex, rawData })
        });
        const resData = await res.json();

        if (resData.error) {
            logEvent(`Dispute challenge failed: ${resData.error}`, "danger");
        } else {
            logEvent(`[Scenario 2] Smart contract verified proof! 100% of Node ${nodeIndex} stake has been slashed. Slashed 10.00 ETH. Node access revoked.`, "danger");
            logEvent(`[Scenario 2] Auditor awarded 5.00 ETH. 5.00 ETH permanently burned. Tx: ${resData.txHash.substring(0, 15)}...`, "success");
            
            nodeWithPendingDispute = null;
            btnDisputeSlashEl.disabled = true;
            fetchState();
        }
    } catch (err) {
        logEvent(`Dispute transaction error: ${err.message}`, "danger");
    }
}

// Scenario 3 Price report round (honest)
async function runHonestEpoch() {
    // Collect active, registered nodes
    const activeNodes = currentSimulationState.nodes.filter(n => n.isRegistered && !n.isSlashed);
    if (activeNodes.length < 3) {
        logEvent(`Cannot run oracle simulation: Need at least 3 active validators. Please stake more nodes.`, "warning");
        return;
    }

    try {
        logEvent(`[Scenario 3] Simulating honest price reports around Schelling Point $100...`, "info");
        
        for (const node of activeNodes) {
            // Generate a price close to 100 (e.g. between 98 and 102)
            const price = 98 + Math.floor(Math.random() * 5);
            const res = await fetch("/api/submit-price", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeIndex: node.index, price })
            });
            await res.json();
        }
        
        logEvent(`[Scenario 3] All active nodes reported prices. Ready to aggregate consensus.`, "info");
        fetchState();
    } catch (err) {
        logEvent(`Error reporting honest prices: ${err.message}`, "danger");
    }
}

// Scenario 3 price report round (collusion cartel)
async function triggerCollusionAttack() {
    const activeNodes = currentSimulationState.nodes.filter(n => n.isRegistered && !n.isSlashed);
    if (activeNodes.length < 3) {
        logEvent(`Cannot run collusion simulation: Need at least 3 active validators. Please stake more nodes.`, "warning");
        return;
    }

    try {
        logEvent(`[Scenario 3] Initiating Coordinated 51% Cartel Collusion. Cartel reports highly inflated prices ($180)...`, "warning");
        
        // Cartel will coordinate to submit $180, while honest nodes submit $100
        // We will make Node 1 and Node 2 submit honest prices ($100), and Node 3, 4, 5 submit inflated prices ($180)
        // If there are fewer nodes, we just inflate the majority.
        const sortedActive = [...activeNodes].sort((a,b) => a.index - b.index);
        const cartelCount = Math.floor(sortedActive.length / 2) + 1; // 51% majority

        for (let i = 0; i < sortedActive.length; i++) {
            const node = sortedActive[i];
            const isCartelMember = i >= (sortedActive.length - cartelCount); // Majority from the end
            const price = isCartelMember ? 180 : 100;
            
            const res = await fetch("/api/submit-price", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nodeIndex: node.index, price })
            });
            await res.json();
            
            if (isCartelMember) {
                logEvent(`[Cartel] Node ${node.index} reported colluded price: $${price}`, "warning");
            } else {
                logEvent(`[Honest] Node ${node.index} reported standard price: $${price}`, "info");
            }
        }
        
        logEvent(`[Scenario 3] Collusion round pricing reported. Ready to aggregate consensus.`, "warning");
        fetchState();
    } catch (err) {
        logEvent(`Error during collusion attack: ${err.message}`, "danger");
    }
}

// Call contract consensus aggregation
async function aggregateConsensus() {
    try {
        logEvent(`[Scenario 3] Triggering aggregateConsensus() contract transaction...`, "info");
        const res = await fetch("/api/aggregate", { method: "POST" });
        const data = await res.json();

        if (data.error) {
            logEvent(`Consensus aggregation failed: ${data.error}`, "danger");
        } else {
            // Check state right away
            const stateRes = await fetch("/api/state");
            const state = await stateRes.json();
            
            if (state.circuitBreakerActive) {
                logEvent(`[Smart Contract Alert] 🛑 CIRCUIT BREAKER TRIGGERED! Variance threshold or economic bounds violated. Aggregation halted!`, "danger");
            } else {
                logEvent(`[Scenario 3] Consensus reached! New price: $${state.lastConsensusPrice}. Epoch updated. Rewards and penalties distributed.`, "success");
            }
            
            currentSimulationState = state;
            updateUI(state);
        }
    } catch (err) {
        logEvent(`Aggregation execution error: ${err.message}`, "danger");
    }
}

// Reset and redeploy
async function resetSimulation() {
    try {
        logEvent(`[System] Dispatching reset command. Recompiling & redeploying contracts...`, "info");
        const res = await fetch("/api/reset", { method: "POST" });
        const data = await res.json();
        
        if (data.error) {
            logEvent(`Reset failed: ${data.error}`, "danger");
        } else {
            logEvent(`[System] New SchellingOracle deployed at: ${data.address}`, "success");
            nodeWithPendingDispute = null;
            dataLogsEl.innerHTML = `<div class="terminal-line placeholder">No data submissions recorded on ledger yet.</div>`;
            fetchState();
        }
    } catch (err) {
        logEvent(`Reset failed: ${err.message}`, "danger");
    }
}

// Set PfC updates
async function updatePfc() {
    const pfc = parseFloat(pfcValEl.value) || 0;
    try {
        const res = await fetch("/api/set-pfc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pfc })
        });
        const data = await res.json();
        if (data.success) {
            logEvent(`[System] Updated Profit from Corruption (PfC) to ${pfc} ETH on ledger.`, "info");
            fetchState();
        }
    } catch (err) {
        console.error("Error setting PfC:", err);
    }
}

// Event Listeners
btnSubmitHonestEl.addEventListener("click", () => submitDataPayload(false));
btnSubmitMaliciousEl.addEventListener("click", () => submitDataPayload(true));
btnDisputeSlashEl.addEventListener("click", triggerDisputeSlash);
btnRunHonestEpochEl.addEventListener("click", runHonestEpoch);
btnTriggerCollusionEl.addEventListener("click", triggerCollusionAttack);
btnAggregateEl.addEventListener("click", aggregateConsensus);
btnResetSimulationEl.addEventListener("click", resetSimulation);
pfcValEl.addEventListener("change", updatePfc);

// Initial Load
fetchState();
setInterval(fetchState, 1000); // Polling every 1s
