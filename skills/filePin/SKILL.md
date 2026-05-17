---
name: filePin-upload
description: Pin a local file to Filecoin decentralized storage and return its CID. Use when the user asks to upload, pin, or store a file on Filecoin.
metadata:
  openclaw:
    requires:
      bins: ["node"]
---

# filePin Upload Skill

Pins a local file to Filecoin storage and returns a CID for retrieval.

## Usage

Invoke via the claw-pin CLI:

```bash
node src/cli/index.js upload <file>
```

Or via the agent skill directly:

```bash
node -e "
  require('./src/integration/agent').initAgent()
    .then(agent => agent.invoke('filePin.upload', process.argv[1]))
    .then(r => console.log('CID:', r.cid));
" path/to/file.txt
```

## Returns

```json
{ "cid": "bafybeig...", "status": "pinned", "size": 1024, "cost": "0.00000001 FIL", "providers": 3 }
```
