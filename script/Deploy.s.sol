// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {CooperativeTreasury} from "../src/CooperativeTreasury.sol";

/// @notice Deploys the cooperative treasury.
///
/// @dev No key material lives in this file. The broadcasting account is supplied by the
///      forge invocation (`--account <keystore>` is preferred over `--private-key`), and
///      the RPC endpoint comes from the environment. See .env.example.
///
///      Usage:
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url base_sepolia --account devcon --broadcast --verify
contract Deploy is Script {
    function run() external returns (CooperativeTreasury treasury) {
        // The cooperative administrator. Defaults to the broadcasting account so a bare
        // `forge script ... --broadcast` works without extra configuration.
        address admin = vm.envOr("COOP_ADMIN", msg.sender);

        vm.startBroadcast();
        treasury = new CooperativeTreasury(admin);
        vm.stopBroadcast();

        console.log("CooperativeTreasury:", address(treasury));
        console.log("Cooperative admin:  ", admin);
        console.log("Total share bps:    ", treasury.TOTAL_SHARE_BPS());
    }
}
