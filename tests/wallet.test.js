/**
 * wallet.test.js — Unit tests for Dev 2's wallet and escrow modules
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Mock viem ESM imports ───────────────────────────────────────────────────

jest.mock('viem', () => ({
  createWalletClient: jest.fn().mockReturnValue({ account: { address: '0xTestAddr123' } }),
  createPublicClient: jest.fn().mockReturnValue({
    getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
  }),
  http: jest.fn().mockReturnValue('mock-transport'),
  formatEther: jest.fn().mockReturnValue('1.0'),
  encodeAbiParameters: jest.fn().mockReturnValue('0xencoded'),
  parseAbiParameters: jest.fn().mockReturnValue([]),
}), { virtual: true });

jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn().mockReturnValue({
    address: '0x1234567890abcdef1234567890abcdef12345678',
  }),
  nonceManager: {},
}), { virtual: true });

jest.mock('viem/chains', () => ({
  filecoin: { id: 314, name: 'Filecoin' },
  filecoinCalibration: { id: 314159, name: 'Filecoin Calibration' },
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
}), { virtual: true });

jest.mock('alkahest-ts', () => ({
  makeClient: jest.fn().mockReturnValue({
    stringObligation: {
      makeStatement: jest.fn().mockResolvedValue({
        attested: { uid: 'test-escrow-uid-123' },
        txHash: '0xdeadbeef',
      }),
    },
  }),
}), { virtual: true });

// Silence logger output during tests
jest.mock('../src/cli/logger', () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  field: jest.fn(),
  divider: jest.fn(),
}));

jest.mock('ora', () =>
  jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  }))
);

// ─── Wallet: filecoinPay.js ──────────────────────────────────────────────────

const {
  generatePrivateKey,
  maskPrivateKey,
} = require('../src/wallet/filecoinPay');

describe('filecoinPay utilities', () => {
  test('generatePrivateKey returns a 0x-prefixed 66-char hex string', () => {
    const key = generatePrivateKey();
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test('generatePrivateKey returns unique keys', () => {
    const key1 = generatePrivateKey();
    const key2 = generatePrivateKey();
    expect(key1).not.toBe(key2);
  });

  test('maskPrivateKey masks the middle of the key', () => {
    const key = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const masked = maskPrivateKey(key);
    expect(masked).toBe('0x1234…cdef');
    expect(masked).not.toContain('567890abcdef');
  });

  test('maskPrivateKey handles short strings', () => {
    expect(maskPrivateKey('')).toBe('***');
    expect(maskPrivateKey(null)).toBe('***');
    expect(maskPrivateKey('short')).toBe('***');
  });
});

// ─── Wallet: mainnet.js ──────────────────────────────────────────────────────

const { createMainnetWallet, loadWallet } = require('../src/wallet/mainnet');

describe('mainnet wallet', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-pin-wallet-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('createMainnetWallet generates wallet and writes .env.wallet', async () => {
    const result = await createMainnetWallet({ projectRoot: tmpDir });

    expect(result).toHaveProperty('address');
    expect(result).toHaveProperty('privateKey');
    expect(result).toHaveProperty('envPath');
    expect(result.privateKey).toMatch(/^0x/);

    const envPath = path.join(tmpDir, '.env.wallet');
    expect(fs.existsSync(envPath)).toBe(true);

    const content = fs.readFileSync(envPath, 'utf8');
    expect(content).toContain('WALLET_ADDRESS=');
    expect(content).toContain('PRIVATE_KEY=');
  });

  test('createMainnetWallet throws WALLET_EXISTS if file already exists', async () => {
    await createMainnetWallet({ projectRoot: tmpDir });

    await expect(createMainnetWallet({ projectRoot: tmpDir })).rejects.toMatchObject({
      code: 'WALLET_EXISTS',
    });
  });

  test('createMainnetWallet with force overwrites existing wallet', async () => {
    const first = await createMainnetWallet({ projectRoot: tmpDir });
    const second = await createMainnetWallet({ projectRoot: tmpDir, force: true });

    expect(second.address).toBeDefined();
    // Keys should be different (new generation)
    expect(second.privateKey).not.toBe(first.privateKey);
  });

  test('loadWallet returns credentials from .env.wallet', async () => {
    await createMainnetWallet({ projectRoot: tmpDir });
    const wallet = loadWallet(tmpDir);

    expect(wallet).not.toBeNull();
    expect(wallet.address).toBeDefined();
    expect(wallet.privateKey).toMatch(/^0x/);
  });

  test('loadWallet returns null if no .env.wallet exists', () => {
    const wallet = loadWallet(tmpDir);
    expect(wallet).toBeNull();
  });
});

// ─── Trustless Skill ─────────────────────────────────────────────────────────────

const { trustlessVerifySkill } = require('../src/skills/trustless');

describe('trustlessVerifySkill (trustless.verifyAndRelease)', () => {
  test('has correct name and params', () => {
    expect(trustlessVerifySkill.name).toBe('trustless.verifyAndRelease');
    expect(trustlessVerifySkill.params).toContain('cid');
  });

  test('has a callable handler function', () => {
    expect(typeof trustlessVerifySkill.handler).toBe('function');
  });
});

// ─── Init Command ─────────────────────────────────────────────────────────────

const { initCommand } = require('../src/cli/cmd/init');

describe('initCommand()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-pin-init-test-'));
    // Override cwd for the init command
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates wallet and returns result', async () => {
    const result = await initCommand({});
    expect(result).not.toBeNull();
    expect(result.address).toBeDefined();
    expect(fs.existsSync(path.join(tmpDir, '.env.wallet'))).toBe(true);
  });
});
