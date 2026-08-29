// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {CooperativeTreasury} from "../src/CooperativeTreasury.sol";

/// @notice Stands up a treasury on a local anvil node with the sixteen Palghar painters
///         on the roster and one buyer payment already split, so the dashboard has real
///         data to render.
///
/// @dev The signing key is read from the environment and deliberately not written down
///      here. Anvil prints its funded development accounts and keys in its own startup
///      banner; export the first one before running. No key material lives in this repo.
///
///      Run:
///        anvil &
///        export SEED_ADMIN_PK=0x…   # anvil account (0)
///        forge script script/SeedLocal.s.sol:SeedLocal --rpc-url http://127.0.0.1:8545 --broadcast
///
///      Local-development fixture. Never point it at a live chain.
contract SeedLocal is Script {
    uint256 internal constant PAINTERS = 16;

    function run() external returns (CooperativeTreasury treasury) {
        uint256 adminPk = vm.envUint("SEED_ADMIN_PK");
        address admin = vm.addr(adminPk);

        vm.startBroadcast(adminPk);
        treasury = new CooperativeTreasury(admin);

        // Sixteen painters, an equal 625 bps each. 16 * 625 == 10000 exactly.
        address[] memory painters = new address[](PAINTERS);
        uint256[] memory shares = new uint256[](PAINTERS);
        for (uint256 i; i < PAINTERS; ++i) {
            painters[i] = address(uint160(0x5000 + i));
            shares[i] = 625;
        }
        treasury.reconfigureMembership(painters, shares);

        // A buyer pays for a batch of cloths. 1 ETH does not divide evenly by sixteen
        // once you are counting wei, so this also leaves a real carried remainder for
        // the dashboard to show.
        treasury.payIn{value: 1 ether + 7 wei}("order-2026-08-batch-1");
        vm.stopBroadcast();

        console.log("");
        console.log("NEXT_PUBLIC_TREASURY_ADDRESS=%s", address(treasury));
        console.log("admin (holds COOP_ADMIN_ROLE): %s", admin);
        console.log("members: %s at 6.25%% each", PAINTERS);
        console.log("carried remainder: %s wei", treasury.carriedRemainder());
        console.log("");
        console.log("Put that address in dashboard/.env.local, then: cd dashboard && npm run dev");
    }
}
