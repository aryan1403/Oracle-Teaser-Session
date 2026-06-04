// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DataSubmissionLedger.sol";

contract SchellingOracle is DataSubmissionLedger {
    uint256 public profitFromCorruption = 35 ether; // default PfC
    bool public circuitBreakerActive = false;
    uint256 public constant VARIANCE_THRESHOLD_PERCENT = 15; // 15% variance threshold
    uint256 public constant MAX_PRICE_DEVIATION_PERCENT = 50; // 50% max deviation from last price
    
    uint256 public currentEpoch;
    uint256 public lastConsensusPrice = 100; // base price

    struct PriceReport {
        uint256 price;
        bool submitted;
    }

    // epoch => validatorAddress => PriceReport
    mapping(uint256 => mapping(address => PriceReport)) public epochReports;
    // epoch => validatorAddresses
    mapping(uint256 => address[]) public epochValidators;

    event PriceSubmitted(uint256 indexed epoch, address indexed validator, uint256 price);
    event ConsensusReached(uint256 indexed epoch, uint256 consensusPrice, uint256 activeValidators);
    event CircuitBreakerTriggered(string reason, uint256 coc, uint256 pfc);
    event ValidatorPenalized(address indexed validator, uint256 penaltyAmount);
    event ValidatorRewarded(address indexed validator, uint256 rewardAmount);

    modifier whenNotHalted() {
        require(!circuitBreakerActive, "SYSTEM HALTED: Circuit breaker is active");
        _;
    }

    function setProfitFromCorruption(uint256 _pfc) external {
        profitFromCorruption = _pfc;
    }

    function getCoC() public view returns (uint256) {
        if (activeValidatorCount == 0) return 0;
        // Cost of Corruption = cost to buy 51% voting power
        // 51% of validators = (activeValidatorCount / 2) + 1
        uint256 majorityCount = (activeValidatorCount / 2) + 1;
        return majorityCount * MINIMUM_STAKE;
    }

    function getSecurityRatio() external view returns (uint256) {
        uint256 coc = getCoC();
        if (profitFromCorruption == 0) return 999;
        return (coc * 100) / profitFromCorruption; // Returns percentage (e.g. 150 = 1.5x)
    }

    function submitPrice(uint256 price) external onlyActiveNode whenNotHalted {
        require(!epochReports[currentEpoch][msg.sender].submitted, "Price already submitted for this epoch");

        epochReports[currentEpoch][msg.sender] = PriceReport({
            price: price,
            submitted: true
        });
        epochValidators[currentEpoch].push(msg.sender);

        emit PriceSubmitted(currentEpoch, msg.sender, price);
    }

    function getEpochValidators(uint256 epoch) external view returns (address[] memory) {
        return epochValidators[epoch];
    }

    function aggregateConsensus() external whenNotHalted {
        uint256 validatorCount = epochValidators[currentEpoch].length;
        require(validatorCount >= 3, "Insufficient price reports to aggregate consensus");

        uint256[] memory prices = new uint256[](validatorCount);
        for (uint256 i = 0; i < validatorCount; i++) {
            prices[i] = epochReports[currentEpoch][epochValidators[currentEpoch][i]].price;
        }

        // Sort the prices to find the median
        sort(prices);

        // Find the median
        uint256 medianPrice;
        if (validatorCount % 2 == 1) {
            medianPrice = prices[validatorCount / 2];
        } else {
            medianPrice = (prices[validatorCount / 2 - 1] + prices[validatorCount / 2]) / 2;
        }

        // Calculate Cost of Corruption & Profit from Corruption
        uint256 coc = getCoC();
        uint256 pfc = profitFromCorruption;

        // Security Guardrail 1: Economic vulnerability check (CoC < PfC) and price deviation
        if (coc < pfc) {
            // Check if median price deviates heavily from last consensus price
            uint256 deviation = medianPrice > lastConsensusPrice ? medianPrice - lastConsensusPrice : lastConsensusPrice - medianPrice;
            uint256 deviationPercent = (deviation * 100) / lastConsensusPrice;
            if (deviationPercent > MAX_PRICE_DEVIATION_PERCENT) {
                circuitBreakerActive = true;
                emit CircuitBreakerTriggered("Economic threshold breached: CoC < PfC and price deviation is excessive", coc, pfc);
                return;
            }
        }

        // Calculate absolute price variance across reporters
        uint256 totalDeviation = 0;
        for (uint256 i = 0; i < validatorCount; i++) {
            uint256 dev = prices[i] > medianPrice ? prices[i] - medianPrice : medianPrice - prices[i];
            totalDeviation += dev;
        }
        uint256 avgDeviation = totalDeviation / validatorCount;
        uint256 variancePercent = (avgDeviation * 100) / medianPrice;

        // Security Guardrail 2: High internal variance (cartel or extreme disagreement)
        if (variancePercent > VARIANCE_THRESHOLD_PERCENT) {
            circuitBreakerActive = true;
            emit CircuitBreakerTriggered("High data variance detected: potential collusion or consensus breakdown", coc, pfc);
            return;
        }

        // Distribute rewards and penalties
        for (uint256 i = 0; i < validatorCount; i++) {
            address val = epochValidators[currentEpoch][i];
            uint256 valPrice = epochReports[currentEpoch][val].price;
            uint256 diff = valPrice > medianPrice ? valPrice - medianPrice : medianPrice - valPrice;
            uint256 diffPercent = (diff * 100) / medianPrice;

            if (diffPercent <= 5) {
                // Honest validation reward: increment validator balance by 0.5 ETH from contract vault
                // (In dynamic simulation, rewards are distributed from transaction fee pool)
                nodes[val].lockedStake += 0.5 ether;
                totalLockedBalance += 0.5 ether;
                emit ValidatorRewarded(val, 0.5 ether);
            } else {
                // Outlier penalty: slash validator stake by 2 ETH
                uint256 penalty = 2 ether;
                if (nodes[val].lockedStake > penalty) {
                    nodes[val].lockedStake -= penalty;
                    totalLockedBalance -= penalty;
                    payable(address(0)).transfer(penalty); // Burn penalty
                } else {
                    penalty = nodes[val].lockedStake;
                    nodes[val].lockedStake = 0;
                    totalLockedBalance -= penalty;
                    nodes[val].isSlashed = true;
                    activeValidatorCount--;
                    payable(address(0)).transfer(penalty);
                }
                emit ValidatorPenalized(val, penalty);
            }
        }

        lastConsensusPrice = medianPrice;
        emit ConsensusReached(currentEpoch, medianPrice, validatorCount);
        currentEpoch++;
    }

    function sort(uint256[] memory a) internal pure {
        for (uint256 i = 1; i < a.length; i++) {
            uint256 temp = a[i];
            uint256 j = i;
            while (j > 0 && a[j - 1] > temp) {
                a[j] = a[j - 1];
                j--;
            }
            a[j] = temp;
        }
    }
}
