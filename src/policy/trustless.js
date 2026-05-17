/**
 * trustless.js - Trustless Policy Module
 * 
 * Defines the simplified escrow logic where verification and payment 
 * are executed conditionally based on Filecoin network status.
 */

'use strict';

const { getPinStatus } = require('../integration/filecoin-pin');
const { getWalletClient, getChainConfig } = require('../wallet/filecoinPay');

/**
 * Verifies that a CID is pinned, and if successful, simulates/releases a payment.
 * 
 * @param {string} cid The Content ID of the pinned file.
 * @returns {Promise<{ released: boolean, txHash: string, status: string }>} 
 */
async function verifyAndRelease(cid) {
  if (!cid) {
    throw new Error('Verification failed: No CID provided.');
  }

  // 1. Verify the pin
  const pinStatus = await getPinStatus(cid);
  
  // The strategy specifies: check if status is 'pinned' (or retrievable) and has providers > 0
  const isVerified = pinStatus.status === 'pinned' || pinStatus.retrievable === true;
  
  if (isVerified && pinStatus.providers > 0) {
    // 2. We trigger the payment release
    return await releasePaymentSimulation(cid);
  } else {
    // Payment NOT released
    throw new Error(`Pin verification failed for CID: ${cid}. Not enough providers or not pinned.`);
  }
}

/**
 * Simulates a payment release via Filecoin Pay.
 * In a fully complete integration, you'd execute an ERC20/FIL transfer via `viem`.
 * 
 * @param {string} cid 
 * @returns {Promise<{ released: boolean, txHash: string, status: string }>}
 */
async function releasePaymentSimulation(cid) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set. Cannot release payment.');
  }

  try {
    const network = process.env.FILECOIN_NETWORK || 'calibration';
    const walletClient = await getWalletClient(privateKey, network);
    const account = walletClient.account;

    // Simulate sending 0 FIL to ourselves as a settlement marker
    const hash = await walletClient.sendTransaction({
      account,
      to: account.address,
      value: 0n,
    });

    return {
      released: true,
      txHash: hash,
      status: 'Verification successful. Payment settled.',
      cid
    };
  } catch (err) {
    // If the transaction fails (e.g., lack of funds), record as a local settlement for demo purposes
    return {
      released: true,
      txHash: `0xLocalSettlement${Date.now()}`,
      status: 'Verification successful. Payment settled locally (Dev/Mock tx).',
      note: `On-chain tx failed: ${err.message}`,
      cid
    };
  }
}

module.exports = { verifyAndRelease, releasePaymentSimulation };