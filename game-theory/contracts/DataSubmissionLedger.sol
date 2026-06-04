// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DataSubmissionLedger {
    uint256 public constant MINIMUM_STAKE = 10 ether;

    struct Node {
        bool isRegistered;
        uint256 lockedStake;
        bool isSlashed;
        string lastSubmittedData;
        bytes32 lastSubmittedDataHash;
        uint256 lastSubmissionTime;
    }

    mapping(address => Node) public nodes;
    address[] public nodeAddresses;
    uint256 public totalLockedBalance;
    uint256 public activeValidatorCount;

    event NodeRegistered(address indexed node, uint256 stake);
    event DataSubmitted(address indexed node, string data, bytes32 dataHash);
    event NodeSlashed(address indexed node, address indexed auditor, uint256 slashedAmount);

    modifier onlyActiveNode() {
        require(nodes[msg.sender].isRegistered, "Node is not registered");
        require(!nodes[msg.sender].isSlashed, "Node has been slashed");
        require(nodes[msg.sender].lockedStake >= MINIMUM_STAKE, "Insufficient stake locked");
        _;
    }

    function registerNode() external payable {
        require(!nodes[msg.sender].isRegistered, "Node already registered");
        require(!nodes[msg.sender].isSlashed, "Node has been permanently slashed");
        require(msg.value == MINIMUM_STAKE, "Incorrect stake amount. Must be exactly 10 ETH");

        nodes[msg.sender] = Node({
            isRegistered: true,
            lockedStake: msg.value,
            isSlashed: false,
            lastSubmittedData: "",
            lastSubmittedDataHash: bytes32(0),
            lastSubmissionTime: 0
        });

        nodeAddresses.push(msg.sender);
        totalLockedBalance += msg.value;
        activeValidatorCount++;

        emit NodeRegistered(msg.sender, msg.value);
    }

    function submitData(string calldata data) external onlyActiveNode {
        bytes32 dataHash = keccak256(abi.encodePacked(data));
        
        nodes[msg.sender].lastSubmittedData = data;
        nodes[msg.sender].lastSubmittedDataHash = dataHash;
        nodes[msg.sender].lastSubmissionTime = block.timestamp;

        emit DataSubmitted(msg.sender, data, dataHash);
    }

    function disputeData(address nodeAddress, string calldata fraudulentData) external {
        Node storage node = nodes[nodeAddress];
        require(node.isRegistered, "Node not registered");
        require(!node.isSlashed, "Node already slashed");
        require(keccak256(abi.encodePacked(fraudulentData)) == node.lastSubmittedDataHash, "Data does not match submission hash");
        
        // Programmatic fraud condition: data contains the word "FRAUD"
        require(checkFraud(fraudulentData), "Submitted data does not violate slashing conditions");
        
        uint256 penalty = node.lockedStake;
        node.lockedStake = 0;
        node.isSlashed = true;
        totalLockedBalance -= penalty;
        activeValidatorCount--;

        // Confiscate 100% of the stake
        // 50% is distributed to the auditor as a reward, 50% is burned (sent to address(0))
        uint256 bounty = penalty / 2;
        payable(msg.sender).transfer(bounty);
        payable(address(0)).transfer(penalty - bounty);

        emit NodeSlashed(nodeAddress, msg.sender, penalty);
    }

    function checkFraud(string memory str) public pure returns (bool) {
        bytes memory b = bytes(str);
        if (b.length < 5) return false;
        
        // Search for substring "FRAUD"
        for (uint i = 0; i <= b.length - 5; i++) {
            if (b[i] == 'F' && b[i+1] == 'R' && b[i+2] == 'A' && b[i+3] == 'U' && b[i+4] == 'D') {
                return true;
            }
        }
        return false;
    }

    function getNodeAddresses() external view returns (address[] memory) {
        return nodeAddresses;
    }

    receive() external payable {}
}
