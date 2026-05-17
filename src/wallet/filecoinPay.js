/**
 * filecoinPay.js — Filecoin Pay SDK wrapper (Real Implementation)
 *
 * Provides wallet client creation and balance queries using viem.
 * Supports both Filecoin Calibration (testnet) and Mainnet.
 */

'use strict';

const crypto = require('crypto');

/**
 * Dynamically import viem (ESM-only) from CJS context.
 * Cached after first call.
 */
let _viemCache = null;
async function loadViem() {
  if (_viemCache) return _viemCache;
  _viemCache = await import('viem');
  return _viemCache;
}

let _viemAccountsCache = null;
async function loadViemAccounts() {
  if (_viemAccountsCache) return _viemAccountsCache;
  _viemAccountsCache = await import('viem/accounts');
  return _viemAccountsCache;
}

let _viemChainsCache = null;
async function loadViemChains() {
  if (_viemChainsCache) return _viemChainsCache;
  _viemChainsCache = await import('viem/chains');
  return _viemChainsCache;
}

/**
 * Get the appropriate chain config based on network name.
 * @param {string} network — 'mainnet', 'calibration', or 'baseSepolia'
 * @returns {Promise<object>} viem chain config
 */
async function getChainConfig(network = 'calibration') {
  const chains = await loadViemChains();

  const chainMap = {
    mainnet: chains.filecoin,
    calibration: chains.filecoinCalibration,
    baseSepolia: chains.baseSepolia,
  };

  const chain = chainMap[network];
  if (!chain) {
    throw new Error(`Unknown network: "${network}". Use: mainnet, calibration, or baseSepolia`);
  }
  return chain;
}

/**
 * Create a viem WalletClient from a private key.
 *
 * @param {string} privateKey — hex private key (0x...)
 * @param {string} network — 'mainnet', 'calibration', or 'baseSepolia'
 * @returns {Promise<import('viem').WalletClient>}
 */
async function getWalletClient(privateKey, network = 'calibration') {
  if (!privateKey) {
    throw new Error('PRIVATE_KEY is required. Run `claw-pin init` to generate a wallet.');
  }

  const viem = await loadViem();
  const { privateKeyToAccount } = await loadViemAccounts();
  const chain = await getChainConfig(network);

  const rpcUrl = process.env.RPC_URL || undefined;

  const account = privateKeyToAccount(privateKey);

  const client = viem.createWalletClient({
    account,
    chain,
    transport: viem.http(rpcUrl),
  });

  return client;
}

/**
 * Create a viem PublicClient for reading chain data.
 *
 * @param {string} network — 'mainnet', 'calibration', or 'baseSepolia'
 * @returns {Promise<import('viem').PublicClient>}
 */
async function getPublicClient(network = 'calibration') {
  const viem = await loadViem();
  const chain = await getChainConfig(network);

  const rpcUrl = process.env.RPC_URL || undefined;

  return viem.createPublicClient({
    chain,
    transport: viem.http(rpcUrl),
  });
}

/**
 * Query the native token balance of an address.
 *
 * @param {string} address — 0x... address
 * @param {string} network — network name
 * @returns {Promise<{ balance: string, formatted: string }>}
 */
async function getWalletBalance(address, network = 'calibration') {
  const viem = await loadViem();
  const client = await getPublicClient(network);

  const balance = await client.getBalance({ address });
  const formatted = viem.formatEther(balance);

  return {
    balance: balance.toString(),
    formatted: `${formatted} FIL`,
  };
}

/**
 * Generate a new random private key.
 * @returns {string} hex private key (0x...)
 */
function generatePrivateKey() {
  const key = crypto.randomBytes(32).toString('hex');
  return `0x${key}`;
}

/**
 * Derive an address from a private key.
 * @param {string} privateKey — hex private key (0x...)
 * @returns {Promise<string>} 0x... address
 */
async function getAddressFromPrivateKey(privateKey) {
  const { privateKeyToAccount } = await loadViemAccounts();
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

/**
 * Mask a private key for safe display: shows first 6 and last 4 chars.
 * @param {string} key
 * @returns {string}
 */
function maskPrivateKey(key) {
  if (!key || key.length < 12) return '***';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

module.exports = {
  getWalletClient,
  getPublicClient,
  getWalletBalance,
  getChainConfig,
  generatePrivateKey,
  getAddressFromPrivateKey,
  maskPrivateKey,
  loadViem,
  loadViemAccounts,
  loadViemChains,
};
