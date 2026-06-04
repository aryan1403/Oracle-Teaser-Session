const express = require("express");
const path = require("path");
const hre = require("hardhat");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let oracleContract = null;
let signers = [];
let deployer = null;
let nodes = [];
let auditor = null;

// Helper to format BigInt balances to Eth numbers
function toEth(wei) {
    return parseFloat(hre.ethers.formatEther(wei));
}

// Reset and deploy fresh contracts on the in-memory ledger
async function deploySimulationContracts() {
    console.log("Compiling Solidity smart contracts...");
    await hre.run("compile");

    console.log("Retrieving local signers from the private ledger...");
    signers = await hre.ethers.getSigners();
    deployer = signers[0];
    
    // Assign 5 nodes and 1 auditor
    nodes = [signers[1], signers[2], signers[3], signers[4], signers[5]];
    auditor = signers[6];

    console.log("Deploying SchellingOracle contract to in-memory network...");
    const SchellingOracle = await hre.ethers.getContractFactory("SchellingOracle", deployer);
    oracleContract = await SchellingOracle.deploy();
    await oracleContract.waitForDeployment();
    
    const contractAddress = await oracleContract.getAddress();
    console.log(`Smart contract deployed successfully at address: ${contractAddress}`);
    return contractAddress;
}

// REST APIs
app.get("/api/state", async (req, res) => {
    try {
        if (!oracleContract) {
            return res.status(500).json({ error: "Contracts not initialized" });
        }

        const contractAddress = await oracleContract.getAddress();
        const activeCount = await oracleContract.activeValidatorCount();
        const totalLocked = await oracleContract.totalLockedBalance();
        const coc = await oracleContract.getCoC();
        const pfc = await oracleContract.profitFromCorruption();
        const secRatio = await oracleContract.getSecurityRatio();
        const epoch = await oracleContract.currentEpoch();
        const lastPrice = await oracleContract.lastConsensusPrice();
        const circuitBreaker = await oracleContract.circuitBreakerActive();

        // Get states for all 5 nodes
        const nodeStates = [];
        for (let i = 0; i < nodes.length; i++) {
            const addr = nodes[i].address;
            const nodeData = await oracleContract.nodes(addr);
            const walletBalance = await hre.ethers.provider.getBalance(addr);

            nodeStates.push({
                index: i + 1,
                address: addr,
                isRegistered: nodeData.isRegistered,
                lockedStake: toEth(nodeData.lockedStake),
                isSlashed: nodeData.isSlashed,
                lastSubmittedData: nodeData.lastSubmittedData,
                lastSubmittedDataHash: nodeData.lastSubmittedDataHash,
                walletBalance: toEth(walletBalance)
            });
        }

        // Auditor state
        const auditorBalance = await hre.ethers.provider.getBalance(auditor.address);
        const auditorState = {
            address: auditor.address,
            walletBalance: toEth(auditorBalance)
        };

        // Current epoch submissions
        const validatorAddrs = await oracleContract.getEpochValidators(epoch);
        const currentEpochSubmissions = [];
        for (const addr of validatorAddrs) {
            const report = await oracleContract.epochReports(epoch, addr);
            currentEpochSubmissions.push({
                address: addr,
                price: report.price.toString()
            });
        }

        res.json({
            contractAddress,
            activeValidatorCount: activeCount.toString(),
            totalLockedBalance: toEth(totalLocked),
            coc: toEth(coc),
            pfc: toEth(pfc),
            securityRatio: secRatio.toString(),
            currentEpoch: epoch.toString(),
            lastConsensusPrice: lastPrice.toString(),
            circuitBreakerActive: circuitBreaker,
            nodes: nodeStates,
            auditor: auditorState,
            currentEpochSubmissions
        });
    } catch (err) {
        console.error("Error fetching state:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/stake", async (req, res) => {
    try {
        const { nodeIndex } = req.body;
        const signer = nodes[nodeIndex - 1];
        if (!signer) {
            return res.status(400).json({ error: "Invalid node index" });
        }

        console.log(`Registering Node ${nodeIndex} (${signer.address}) with 10 ETH stake...`);
        const tx = await oracleContract.connect(signer).registerNode({
            value: hre.ethers.parseEther("10")
        });
        await tx.wait();

        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/submit-data", async (req, res) => {
    try {
        const { nodeIndex, data } = req.body;
        const signer = nodes[nodeIndex - 1];
        if (!signer) {
            return res.status(400).json({ error: "Invalid node index" });
        }

        console.log(`Node ${nodeIndex} submitting data: "${data}"`);
        const tx = await oracleContract.connect(signer).submitData(data);
        await tx.wait();

        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/dispute", async (req, res) => {
    try {
        const { nodeIndex, rawData } = req.body;
        const targetNode = nodes[nodeIndex - 1];
        if (!targetNode) {
            return res.status(400).json({ error: "Invalid node index" });
        }

        console.log(`Auditor triggering dispute against Node ${nodeIndex} (${targetNode.address}) with proof data: "${rawData}"`);
        const tx = await oracleContract.connect(auditor).disputeData(targetNode.address, rawData);
        await tx.wait();

        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/set-pfc", async (req, res) => {
    try {
        const { pfc } = req.body;
        const pfcWei = hre.ethers.parseEther(pfc.toString());
        console.log(`Setting Profit from Corruption (PfC) to ${pfc} ETH...`);
        
        const tx = await oracleContract.connect(deployer).setProfitFromCorruption(pfcWei);
        await tx.wait();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/submit-price", async (req, res) => {
    try {
        const { nodeIndex, price } = req.body;
        const signer = nodes[nodeIndex - 1];
        if (!signer) {
            return res.status(400).json({ error: "Invalid node index" });
        }

        console.log(`Node ${nodeIndex} reporting oracle price: $${price}`);
        const tx = await oracleContract.connect(signer).submitPrice(price);
        await tx.wait();

        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/aggregate", async (req, res) => {
    try {
        console.log("Triggering consensus aggregation...");
        const tx = await oracleContract.connect(deployer).aggregateConsensus();
        await tx.wait();

        res.json({ success: true, txHash: tx.hash });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/reset", async (req, res) => {
    try {
        console.log("Resetting simulation and deploying fresh ledger environment...");
        const addr = await deploySimulationContracts();
        res.json({ success: true, address: addr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Launch server
async function startServer() {
    try {
        await deploySimulationContracts();
        app.listen(PORT, () => {
            console.log(`================================================================`);
            console.log(`Cryptoeconomic Lab Simulation Backend running on http://localhost:${PORT}`);
            console.log(`================================================================`);
        });
    } catch (err) {
        console.error("Failed to start simulation server:", err);
    }
}

startServer();
