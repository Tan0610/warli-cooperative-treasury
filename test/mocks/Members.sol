// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CooperativeTreasury} from "../../src/CooperativeTreasury.sol";

/// @notice A member contract that tries to withdraw a second time from inside the ETH
///         transfer of the first withdrawal. It swallows the failure so the outer call
///         still succeeds, which lets a test assert it was paid exactly once.
contract ReentrantMember {
    CooperativeTreasury public immutable treasury;

    bool public reentered;
    bool public reentrySucceeded;

    constructor(CooperativeTreasury treasury_) {
        treasury = treasury_;
    }

    function attack() external {
        treasury.withdraw();
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            try treasury.withdraw() {
                reentrySucceeded = true;
            } catch {
                reentrySucceeded = false;
            }
        }
    }
}

/// @notice A member whose fallback always reverts, standing in for an artisan using a
///         wallet that cannot accept a plain transfer. Under a push-payment loop this
///         one address would block the payout for the entire cooperative.
contract RejectingMember {
    function pull(CooperativeTreasury treasury) external {
        treasury.withdraw();
    }

    receive() external payable {
        revert("I cannot accept ETH");
    }
}
