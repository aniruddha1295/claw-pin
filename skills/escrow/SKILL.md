---
name: escrow-create
description: Create an Alkahest escrow contract for a Filecoin pin. Holds payment until pin is verified. Use when the user asks to upload with escrow, trustless payment, or conditional payment.
metadata:
  openclaw:
    requires:
      bins: ["node"]
---

# Escrow Create Skill

Creates an Alkahest conditional payment escrow for a Filecoin CID.

## Status

Under development by Dev 2. Requires `alkahest-client` integration.

## Usage (once implemented)

```bash
node src/cli/index.js upload --escrow <file>
```

## Expected Return

```json
{ "contractAddress": "0x...", "status": "pending" }
```
