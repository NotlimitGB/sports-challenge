// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SportsChallenge {
    address public organizer;
    address public verifier;

    uint256 public depositAmount;
    uint256 public totalPool;
    uint256 public winnersCount;
    bool public finalized;

    struct Participant {
        bool joined;
        bool verified;
        bool passed;
        bool claimed;
    }

    mapping(address => Participant) public participants;
    address[] public participantList;

    event Joined(address indexed participant, uint256 amount);
    event ResultSubmitted(address indexed participant, bool passed);
    event Finalized(uint256 winnersCount, uint256 totalPool);
    event RewardClaimed(address indexed participant, uint256 amount);

    modifier onlyOrganizer() {
        require(msg.sender == organizer, "Only organizer");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "Only verifier");
        _;
    }

    constructor(uint256 _depositAmount, address _verifier) {
        require(_depositAmount > 0, "Deposit must be > 0");
        require(_verifier != address(0), "Bad verifier");

        organizer = msg.sender;
        verifier = _verifier;
        depositAmount = _depositAmount;
    }

    function joinChallenge() external payable {
        require(!participants[msg.sender].joined, "Already joined");
        require(msg.value == depositAmount, "Wrong deposit");

        participants[msg.sender].joined = true;
        participantList.push(msg.sender);
        totalPool += msg.value;

        emit Joined(msg.sender, msg.value);
    }

    function submitResult(address participant, bool passed_) external onlyVerifier {
        Participant storage p = participants[participant];

        require(p.joined, "Not participant");
        require(!p.verified, "Already verified");

        p.verified = true;
        p.passed = passed_;

        if (passed_) {
            winnersCount += 1;
        }

        emit ResultSubmitted(participant, passed_);
    }

    function finalizeChallenge() external onlyOrganizer {
        require(!finalized, "Already finalized");
        finalized = true;

        emit Finalized(winnersCount, totalPool);
    }

    function claimReward() external {
        require(finalized, "Challenge not finalized");

        Participant storage p = participants[msg.sender];

        require(p.joined, "Not participant");
        require(p.verified, "Not verified");
        require(p.passed, "Challenge failed");
        require(!p.claimed, "Already claimed");
        require(winnersCount > 0, "No winners");

        p.claimed = true;

        uint256 reward = totalPool / winnersCount;
        payable(msg.sender).transfer(reward);

        emit RewardClaimed(msg.sender, reward);
    }

    function getParticipantsCount() external view returns (uint256) {
        return participantList.length;
    }
}