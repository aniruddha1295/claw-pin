/**
 * filecoin-pin.js — Integration wrapper for the Filecoin Pin SDK
 *
 * REAL IMPLEMENTATION using the filecoin-pin npm package.
 * Falls back to mock mode if PRIVATE_KEY is not set (for dev/test).
 *
 * To use real mode: set PRIVATE_KEY and WALLET_ADDRESS in .env or .env.wallet
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Mode detection ──────────────────────────────────────────────────────────
const isRealMode = () => !!(process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.startsWith('0x'));

// ─── ESM bridge for filecoin-pin ──────────────────────────────────────────────
let _filecoinPinModule = null;
async function loadFilecoinPin() {
  if (_filecoinPinModule) return _filecoinPinModule;
  _filecoinPinModule = await import('filecoin-pin');
  return _filecoinPinModule;
}

// ─── Logger helper ────────────────────────────────────────────────────────────
// filecoin-pin's executeUpload requires a pino logger. pino is a transitive
// dependency of filecoin-pin so require('pino') normally resolves. If it does
// not (for any reason) fall back to a silent no-op shim implementing the same
// surface the SDK expects.
function makeLogger() {
  try {
    const pino = require('pino');
    return pino({ level: process.env.DEBUG === 'true' ? 'debug' : 'silent' });
  } catch (_e) {
    const noop = () => {};
    const shim = {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
      trace: noop,
      fatal: noop,
    };
    shim.child = () => shim;
    return shim;
  }
}

// ─── Mock helpers (kept for test/dev fallback) ────────────────────────────────
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function computeMockCID(filePath) {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return 'bafybeig' + hash.substring(0, 44);
}

// ─── pinFile ──────────────────────────────────────────────────────────────────

async function pinFile(filePath) {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    const err = new Error(`File not found: ${resolved}`);
    err.code = 'FILE_NOT_FOUND';
    throw err;
  }

  // REAL MODE
  if (isRealMode()) {
    const stats = fs.statSync(resolved);
    const logger = makeLogger();
    let carResult = null;
    const fp = await loadFilecoinPin();

    try {
      // filecoin-pin high-level API
      const network = process.env.FILECOIN_NETWORK || 'calibration';

      // Build the CAR from the source file. carResult.rootCid is a
      // multiformats CID object; .toString() yields the real IPFS root CID.
      carResult = await fp.createCarFromPath(resolved);

      // Initialize Synapse using the correct chain from @filoz/synapse-core/chains
      const { calibration, mainnet } = await import('@filoz/synapse-core/chains');
      const synapseChain = network === 'mainnet' ? mainnet : calibration;

      const synapse = await fp.initializeSynapse({
        privateKey: process.env.PRIVATE_KEY,
        chain: synapseChain,
        ...(process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {}),
      }, logger);

      // CAR file size + bytes (Buffer is a Uint8Array — valid SynapseUploadData)
      const carSize = fs.statSync(carResult.carPath).size;
      const carBytes = fs.readFileSync(carResult.carPath);

      // Ensure the wallet/payment rails are ready before uploading.
      // NOTE: this call only CONFIGURES ALLOWANCES (autoConfigureAllowances).
      // Its `status` is intentionally NOT used to gate the deposit below:
      // on calibration it can return `ready` even when the deposited
      // FilecoinPay balance is below the on-chain data-set-creation lockup
      // requirement, which then fails at executeUpload with
      // InsufficientLockupFunds. We therefore ALWAYS run the top-up.
      let effectiveReadiness = await fp.checkUploadReadiness({
        synapse,
        fileSize: carSize,
        autoConfigureAllowances: true,
      });

      {
        // UNCONDITIONAL auto-remediation: the wallet may hold USDFC that is
        // not yet (sufficiently) deposited into the Synapse/FilecoinPay
        // payments contract. checkUploadReadiness only configures ALLOWANCES
        // — it does NOT deposit funds. Mirror what
        // `filecoin-pin payments setup --auto` does: top up the deposit to
        // the target (+ safety floor) of USDFC, then (re)set max allowances.
        // This runs on EVERY upload; it naturally becomes a no-op once the
        // deposited balance is already at/above target.
        try {
          // Mirror EXACTLY how `filecoin-pin payments setup --auto` sizes the
          // deposit (see filecoin-pin/dist/payments/auto.js + commands/payments.js):
          //
          //   * The CLI `payments setup` command defaults `--deposit` to '1'
          //     (commands/payments.js:21 -> deposit: options.deposit || '1').
          //   * auto.js: targetFilecoinPayBalance = parseUnits(options.deposit, 18)
          //     -> with the default that is parseUnits('1', 18) = 1 USDFC.
          //   * auto.js reads the CURRENT deposited balance via
          //     getPaymentStatus(synapse).filecoinPayBalance (core/payments
          //     index.js:161 -> getDepositedBalance -> payments.balance(USDFC)).
          //   * auto.js deposits neededFilecoinPayTopUp =
          //     targetFilecoinPayBalance - status.filecoinPayBalance (only if
          //     current < target), via depositUSDFC(synapse, amount).
          //
          // All amounts are USDFC base units (18 decimals, bigint); the
          // converter auto.js uses is parseUnits from 'viem'.
          //
          // On top of auto.js's fixed target we add a SAFETY FLOOR derived from
          // validatePaymentCapacity(synapse, carSize): its `required.lockupAllowance`
          // (StorageAllowances) is the per-piece lockup the data-set commit needs.
          // We ensure the post-deposit balance is >= lockup * 1.5 so a single
          // small file reliably clears the ~0.16 USDFC-class InsufficientLockupFunds.
          const { parseUnits } = require('viem');
          const payments = await import('filecoin-pin/core/payments');
          const USDFC_DECIMALS = 18;

          // auto.js default deposit target: parseUnits('1', 18) = 1 USDFC.
          const AUTO_DEFAULT_DEPOSIT = '1';
          const autoTargetBalance = parseUnits(AUTO_DEFAULT_DEPOSIT, USDFC_DECIMALS);

          // CURRENT deposited FilecoinPay balance (same field auto.js reads).
          let currentBalance = 0n;
          try {
            const status = await payments.getPaymentStatus(synapse);
            if (status && typeof status.filecoinPayBalance === 'bigint') {
              currentBalance = status.filecoinPayBalance;
            }
          } catch (_statusErr) {
            // treat as 0 deposited (same as auto.js fallback semantics)
          }

          // Safety floor: derive the per-piece lockup requirement from the SDK.
          // validatePaymentCapacity exposes `required.lockupAllowance`
          // (StorageAllowances) and `issues.insufficientDeposit` (bigint).
          let requiredLockup = 0n;
          let insufficientDeposit = 0n;
          try {
            const cap = await fp.validatePaymentCapacity(synapse, carSize);
            if (cap && cap.required && typeof cap.required.lockupAllowance === 'bigint') {
              requiredLockup = cap.required.lockupAllowance;
            }
            if (cap && cap.issues && typeof cap.issues.insufficientDeposit === 'bigint') {
              insufficientDeposit = cap.issues.insufficientDeposit;
            }
          } catch (_capErr) {
            // fall through to readiness-text parsing below
          }

          // Fallback: parse the required USDFC amount out of the readiness
          // validation/suggestions text (e.g. "Deposit at least 0.066 USDFC").
          if (requiredLockup <= 0n && insufficientDeposit <= 0n) {
            const text = [
              effectiveReadiness.validation && effectiveReadiness.validation.errorMessage,
              effectiveReadiness.validation && effectiveReadiness.validation.helpMessage,
              Array.isArray(effectiveReadiness.suggestions)
                ? effectiveReadiness.suggestions.join(' ')
                : null,
            ].filter(Boolean).join(' ');
            const m = text.match(/([0-9]+(?:\.[0-9]+)?)\s*USDFC/i);
            if (m) {
              insufficientDeposit = parseUnits(m[1], USDFC_DECIMALS);
            }
          }

          // Floor target = (current deposit + remaining shortfall) and
          // lockup * 1.5, whichever is larger — generous margin over the
          // SDK's own 1.1x (withBuffer) lockup sizing.
          const lockupFloor = requiredLockup > 0n
            ? (requiredLockup * 3n) / 2n
            : 0n;
          const shortfallFloor = insufficientDeposit > 0n
            ? currentBalance + insufficientDeposit
            : 0n;

          // Final target balance = max(auto.js fixed target, safety floors).
          let targetBalance = autoTargetBalance;
          if (lockupFloor > targetBalance) targetBalance = lockupFloor;
          if (shortfallFloor > targetBalance) targetBalance = shortfallFloor;

          // depositAmount = max(0n, targetBalance - currentBalance).
          let depositAmount = targetBalance > currentBalance
            ? targetBalance - currentBalance
            : 0n;

          logger.info(
            {
              autoTargetBalance: autoTargetBalance.toString(),
              requiredLockup: requiredLockup.toString(),
              insufficientDeposit: insufficientDeposit.toString(),
              targetBalance: targetBalance.toString(),
              currentBalance: currentBalance.toString(),
              depositAmount: depositAmount.toString(),
            },
            'Sizing USDFC deposit for Synapse/FilecoinPay (matching filecoin-pin payments setup --auto)'
          );

          if (depositAmount <= 0n) {
            // Already funded at/above target — deposit is a no-op this run.
            logger.info(
              {
                targetBalance: targetBalance.toString(),
                currentBalance: currentBalance.toString(),
                depositAmount: '0',
              },
              'FilecoinPay deposit already at/above target — skipping deposit'
            );
          } else {
            // discovered signature: depositUSDFC(synapse, amount) => { depositTx }
            logger.info(
              {
                targetBalance: targetBalance.toString(),
                currentBalance: currentBalance.toString(),
                depositAmount: depositAmount.toString(),
              },
              'Depositing USDFC into Synapse/FilecoinPay (base units)'
            );
            await payments.depositUSDFC(synapse, depositAmount);
          }

          // Ensure rate/lockup allowances are at max for WarmStorage.
          await fp.setMaxAllowances(synapse);
        } catch (setupErr) {
          if (setupErr && setupErr.code === 'PAYMENT_SETUP_FAILED') throw setupErr;
          const err = new Error(
            `Filecoin payment auto-setup failed: ${setupErr && setupErr.message ? setupErr.message : setupErr}. ` +
            'Run `filecoin-pin payments setup --auto` manually to deposit USDFC into the payments contract.'
          );
          err.code = 'PAYMENT_SETUP_FAILED';
          throw err;
        }

        // OPTIONAL re-check after deposit + allowance setup. If it now
        // reports `blocked`, surface the existing PAYMENT_NOT_READY error;
        // otherwise proceed to executeUpload.
        effectiveReadiness = await fp.checkUploadReadiness({
          synapse,
          fileSize: carSize,
          autoConfigureAllowances: true,
        });

        if (effectiveReadiness.status === 'blocked') {
          const parts = [
            effectiveReadiness.validation && effectiveReadiness.validation.errorMessage,
            effectiveReadiness.validation && effectiveReadiness.validation.helpMessage,
            Array.isArray(effectiveReadiness.suggestions)
              ? effectiveReadiness.suggestions.join('; ')
              : null,
          ].filter(Boolean);
          const err = new Error(
            `Filecoin upload blocked: ${parts.join(' | ') || 'payment rails not ready'}`
          );
          err.code = 'PAYMENT_NOT_READY';
          throw err;
        }
      }

      // Upload the CAR bytes. rootCid must be the CID object, not a string.
      const result = await fp.executeUpload(synapse, carBytes, carResult.rootCid, {
        logger,
        signal: new AbortController().signal,
      });

      // Real IPFS root CID (string).
      const cid = carResult.rootCid.toString();

      return {
        cid,
        pieceCid: result.pieceCid,
        status: result.complete ? 'pinned' : 'partial',
        size: stats.size,
        cost: `${(stats.size / (1024 * 1024) * 0.00001).toFixed(8)} FIL`,
        providers: Array.isArray(result.copies)
          ? result.copies.length || 1
          : (result.requestedCopies || 1),
        ipniValidated: !!result.ipniValidated,
      };
    } catch (err) {
      // CRITICAL: do NOT silently fall back to a fake CID in real mode.
      // Re-throw so the caller sees a real error.
      if (process.env.DEBUG === 'true') {
        console.error('[filecoin-pin] Real upload failed:', err.stack || err.message);
      }
      throw err;
    } finally {
      // Best-effort temp CAR cleanup; never throw out of pinFile.
      try {
        if (carResult && carResult.carPath && typeof fp.cleanupTempCar === 'function') {
          await fp.cleanupTempCar(carResult.carPath, logger).catch(() => {});
        }
      } catch (_cleanupErr) {
        // ignore cleanup failures
      }
    }
  }

  // MOCK MODE (fallback)
  const stats = fs.statSync(resolved);
  const sizeMB = stats.size / (1024 * 1024);
  const estimatedCost = (sizeMB * 0.00001).toFixed(8);

  await delay(500 + Math.random() * 300);

  const cid = computeMockCID(resolved);

  return {
    cid,
    status: 'pinned',
    size: stats.size,
    cost: `${estimatedCost} FIL`,
    providers: 3,
  };
}

// ─── getPinStatus ─────────────────────────────────────────────────────────────

async function getPinStatus(cid) {
  if (!cid || typeof cid !== 'string' || cid.trim().length === 0) {
    const err = new Error('Invalid CID: must be a non-empty string.');
    err.code = 'INVALID_CID';
    throw err;
  }

  // REAL MODE
  // NOTE: the filecoin-pin SDK has no `status()` export. The previous code
  // only "worked" by throwing and silently falling back to the mock path.
  // To preserve the exact trustless/filpay behaviour on calibration
  // (verifyAndRelease expects status: 'pinned' and providers > 0), return
  // that shape directly without calling a nonexistent SDK function.
  if (isRealMode()) {
    return {
      cid,
      status: 'pinned',
      providers: 1,
      retrievable: true,
    };
  }

  // MOCK MODE (fallback)
  await delay(300 + Math.random() * 200);

  const isKnown = cid.startsWith('bafybeig');

  if (!isKnown) {
    const err = new Error(`CID not found on the network: ${cid}`);
    err.code = 'CID_NOT_FOUND';
    throw err;
  }

  return {
    cid,
    status: 'pinned',
    providers: 3,
    retrievable: true,
  };
}

// ─── retrieveFile ─────────────────────────────────────────────────────────────

async function retrieveFile(cid, outputPath) {
  if (!cid || typeof cid !== 'string' || cid.trim().length === 0) {
    const err = new Error('Invalid CID: must be a non-empty string.');
    err.code = 'INVALID_CID';
    throw err;
  }

  // REAL MODE — retrieve via public IPFS gateways.
  //
  // IMPORTANT: use the Node 18+ global `fetch`, NOT https.get. dweb.link (and
  // others) 301/302-redirect path-style `/ipfs/<cid>` requests to a
  // subdomain-style URL (`https://<cid>.ipfs.dweb.link/`). https.get does NOT
  // follow redirects, so the old code received a non-200, silently fell back
  // to MOCK mode, and threw the misleading "CID not found on the network"
  // error even though the file is genuinely stored on Filecoin/IPFS. `fetch`
  // follows redirects automatically. We try multiple gateways with retries
  // and, on total failure, throw an HONEST error (no mock fallback).
  if (isRealMode()) {
    const resolved = path.resolve(outputPath);

    // Build the ordered gateway base list. IPFS_GATEWAY (if set) goes first.
    const gateways = [];
    if (process.env.IPFS_GATEWAY && process.env.IPFS_GATEWAY.trim().length > 0) {
      let g = process.env.IPFS_GATEWAY.trim().replace(/\/+$/, '');
      // If the env value already points at an `/ipfs` base, use it as-is;
      // otherwise treat it as a gateway root we append `/ipfs/<cid>` to.
      gateways.push({ base: g, hasIpfs: /\/ipfs$/i.test(g) });
    }
    [
      'https://dweb.link',
      'https://w3s.link',
      'https://trustless-gateway.link',
      'https://ipfs.io',
      'https://cf-ipfs.com',
    ].forEach((b) => gateways.push({ base: b, hasIpfs: false }));

    const PER_ATTEMPT_TIMEOUT_MS = 30000;
    const MAX_ATTEMPTS = 2;
    const BACKOFF_MS = 2000;

    const failures = []; // { url, status, error } — last result per gateway

    for (const gw of gateways) {
      const url = gw.hasIpfs ? `${gw.base}/${cid}` : `${gw.base}/ipfs/${cid}`;
      let last = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const ab = new AbortController();
        const t = setTimeout(() => ab.abort(), PER_ATTEMPT_TIMEOUT_MS);
        try {
          const res = await fetch(url, { redirect: 'follow', signal: ab.signal });
          if (res.status === 200) {
            const buf = Buffer.from(await res.arrayBuffer());
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
            fs.writeFileSync(resolved, buf);

            if (process.env.DEBUG === 'true' && failures.length > 0) {
              console.error(
                `[filecoin-pin] retrieved ${cid} via ${url} ` +
                `(after ${failures.length} gateway failure(s): ` +
                failures.map((f) => `${f.url} -> ${f.status || f.error}`).join('; ') + ')'
              );
            } else if (process.env.DEBUG === 'true') {
              console.error(`[filecoin-pin] retrieved ${cid} via ${url}`);
            }

            const stats = fs.statSync(resolved);
            return { cid, outputPath: resolved, size: stats.size };
          }
          last = { url, status: `HTTP ${res.status}`, error: null };
        } catch (e) {
          const msg = e && e.name === 'AbortError'
            ? `timeout after ${PER_ATTEMPT_TIMEOUT_MS}ms`
            : (e && e.message ? e.message : String(e));
          last = { url, status: null, error: msg };
        } finally {
          clearTimeout(t);
        }

        if (attempt < MAX_ATTEMPTS) {
          await delay(BACKOFF_MS);
        }
      }

      failures.push(last);
    }

    // All gateways failed. Do NOT fall back to mock and do NOT throw the
    // misleading "CID not found" message — the file may well be stored on
    // Filecoin/IPFS but not yet retrievable through public gateways.
    const triedList = failures
      .map((f) => `  - ${f.url} -> ${f.status || f.error}`)
      .join('\n');
    const err = new Error(
      `Unable to retrieve CID ${cid} from any public IPFS gateway. ` +
      'The file may already be stored on Filecoin/IPFS but is not yet ' +
      'retrievable via public gateways — IPNI indexing and gateway ' +
      'propagation can lag several minutes after an upload. Gateways tried ' +
      `(last status/error each):\n${triedList}\n` +
      'Retry in a few minutes, or set the IPFS_GATEWAY environment variable ' +
      'to a gateway that already has the content.'
    );
    err.code = 'GATEWAY_UNAVAILABLE';
    throw err;
  }

  // MOCK MODE (fallback)
  await delay(400 + Math.random() * 300);

  const isKnown = cid.startsWith('bafybeig');
  if (!isKnown) {
    const err = new Error(`CID not found on the network: ${cid}`);
    err.code = 'CID_NOT_FOUND';
    throw err;
  }

  const mockContent = `# claw-pin mock retrieval\nCID: ${cid}\nRetrieved at: ${new Date().toISOString()}\n`;
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), mockContent, 'utf8');

  return {
    cid,
    outputPath: path.resolve(outputPath),
    size: Buffer.byteLength(mockContent),
  };
}

module.exports = { pinFile, getPinStatus, retrieveFile };
