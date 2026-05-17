# 💸 Escrow Payment Flow — claw-pin

## Overview

The escrow system uses **Alkahest** on Base Sepolia to create trustless conditional payments tied to Filecoin CID pins. Funds are locked when a file is uploaded with `--escrow` and released only after pin verification confirms the data is stored.

## Lifecycle Diagram

```mermaid
sequenceDiagram
    participant User
    participant CLI as claw-pin CLI
    participant Agent as OpenClaw Agent
    participant FP as Filecoin Pin
    participant AK as Alkahest (Base Sepolia)

    User->>CLI: claw-pin upload --escrow file.txt
    CLI->>Agent: invoke("filePin.upload", file)
    Agent->>FP: pinFile(file)
    FP-->>Agent: { cid, status: "pinned" }
    Agent-->>CLI: pin result

    CLI->>Agent: invoke("escrow.create", cid, wallet)
    Agent->>AK: makeStatement(cid)
    AK-->>Agent: { escrowUid, status: "locked" }
    Agent-->>CLI: escrow result
    CLI-->>User: CID + Contract Address

    Note over User,AK: ⏳ Time passes — pin remains active

    User->>CLI: claw-pin release <contract> --cid <CID>
    CLI->>FP: getPinStatus(cid)
    FP-->>CLI: { retrievable: true }
    CLI->>AK: releaseEscrow(contract, cid)
    AK-->>CLI: { released: true, txHash }
    CLI-->>User: Funds released ✅
```

## State Machine

```mermaid
stateDiagram-v2
    [*] --> Uploading: claw-pin upload --escrow
    Uploading --> Pinned: File pinned to Filecoin
    Pinned --> Locked: Escrow created on Alkahest
    Locked --> Verifying: claw-pin release
    Verifying --> Released: Pin verified → funds released
    Verifying --> Failed: Pin not found → funds held
    Failed --> Verifying: Retry release
    Released --> [*]
```

## Commands

| Command | Action | Chain |
|:---|:---|:---|
| `claw-pin init` | Generate wallet (0x address) | — |
| `claw-pin upload --escrow <file>` | Pin file + lock escrow | Filecoin + Base Sepolia |
| `claw-pin release <contract> --cid <CID>` | Verify pin + release funds | Filecoin + Base Sepolia |

## Environment Variables

| Variable | Required | Description |
|:---|:---|:---|
| `PRIVATE_KEY` | Yes | Wallet private key (0x...) |
| `WALLET_ADDRESS` | Yes | Wallet address (0x...) |
| `FILECOIN_NETWORK` | No | `calibration` (default) or `mainnet` |
| `BASE_SEPOLIA_RPC_URL` | No | Base Sepolia RPC (default: https://sepolia.base.org) |

## Security Notes

- Private keys are stored in `.env.wallet` (gitignored)
- Escrow funds are locked on-chain — only the wallet owner can release
- Pin verification happens before any fund release
- Use Calibration testnet for testing (no real funds at risk)
