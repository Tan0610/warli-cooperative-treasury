/**
 * The slice of CooperativeTreasury this dashboard uses. Hand-written and minimal so it
 * stays readable, rather than pasting the full generated artifact.
 */
export const treasuryAbi = [
  // --- reads -------------------------------------------------------------
  {
    type: "function",
    name: "getMembers",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple[]",
        components: [
          {name: "account", type: "address"},
          {name: "shareBps", type: "uint256"},
          {name: "withdrawable", type: "uint256"},
        ],
      },
    ],
  },
  {
    type: "function",
    name: "previewSplit",
    stateMutability: "view",
    inputs: [{name: "amount", type: "uint256"}],
    outputs: [
      {name: "accounts", type: "address[]"},
      {name: "amounts", type: "uint256[]"},
      {name: "toReserve", type: "uint256"},
      {name: "remainder", type: "uint256"},
    ],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      {name: "role", type: "bytes32"},
      {name: "account", type: "address"},
    ],
    outputs: [{type: "bool"}],
  },
  {type: "function", name: "COOP_ADMIN_ROLE", stateMutability: "view", inputs: [], outputs: [{type: "bytes32"}]},
  {type: "function", name: "TOTAL_SHARE_BPS", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "allocatedShareBps", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "unallocatedShareBps", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "reserveBalance", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "carriedRemainder", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "totalReceived", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "totalOwedToMembers", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
  {type: "function", name: "isSolvent", stateMutability: "view", inputs: [], outputs: [{type: "bool"}]},
  {
    type: "function",
    name: "withdrawable",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "shareOf",
    stateMutability: "view",
    inputs: [{name: "account", type: "address"}],
    outputs: [{type: "uint256"}],
  },

  // --- writes ------------------------------------------------------------
  {
    type: "function",
    name: "addMember",
    stateMutability: "nonpayable",
    inputs: [
      {name: "account", type: "address"},
      {name: "shareBps", type: "uint256"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeMember",
    stateMutability: "nonpayable",
    inputs: [{name: "account", type: "address"}],
    outputs: [],
  },
  {
    type: "function",
    name: "setMemberShare",
    stateMutability: "nonpayable",
    inputs: [
      {name: "account", type: "address"},
      {name: "newShareBps", type: "uint256"},
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "payIn",
    stateMutability: "payable",
    inputs: [{name: "memo", type: "string"}],
    outputs: [],
  },
  {type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [], outputs: [{type: "uint256"}]},
] as const;
