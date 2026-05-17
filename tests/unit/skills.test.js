'use strict';

jest.mock('../../src/integration/filecoin-pin', () => ({
  pinFile: jest.fn().mockResolvedValue({
    cid: 'bafybeigTestCID123',
    status: 'pinned',
    size: 1024,
    cost: '0.00000001 FIL',
    providers: 3,
  }),
  getPinStatus: jest.fn().mockResolvedValue({
    cid: 'bafybeigTestCID123',
    status: 'pinned',
    providers: 3,
    retrievable: true,
  }),
  retrieveFile: jest.fn().mockResolvedValue({
    cid: 'bafybeigTestCID123',
    outputPath: '/tmp/output.txt',
    size: 512,
  }),
}));

jest.mock('openclaw-sdk', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  }),
}));

// ─── filePin skills ───────────────────────────────────────────────────────────

const { filePinSkill, filePinStatusSkill, filePinRetrieveSkill } = require('../../src/skills/filePin');

describe('filePinSkill (filePin.upload)', () => {
  test('has correct name, description, and params', () => {
    expect(filePinSkill.name).toBe('filePin.upload');
    expect(typeof filePinSkill.description).toBe('string');
    expect(filePinSkill.params).toContain('filePath');
  });

  test('handler pins file and returns full result shape', async () => {
    const ctx = { log: jest.fn() };
    const result = await filePinSkill.handler(ctx, '/tmp/test.txt');

    expect(result).toMatchObject({
      cid: 'bafybeigTestCID123',
      status: 'pinned',
      size: 1024,
      cost: '0.00000001 FIL',
      providers: 3,
    });
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('/tmp/test.txt'));
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('bafybeigTestCID123'));
  });

  test('handler propagates pinFile errors', async () => {
    const { pinFile } = require('../../src/integration/filecoin-pin');
    const err = new Error('File not found');
    err.code = 'FILE_NOT_FOUND';
    pinFile.mockRejectedValueOnce(err);

    const ctx = { log: jest.fn() };
    await expect(filePinSkill.handler(ctx, '/bad/path.txt')).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });
  });
});

describe('filePinStatusSkill (filePin.status)', () => {
  test('has correct name and params', () => {
    expect(filePinStatusSkill.name).toBe('filePin.status');
    expect(filePinStatusSkill.params).toContain('cid');
  });

  test('handler queries status and returns result', async () => {
    const ctx = { log: jest.fn() };
    const result = await filePinStatusSkill.handler(ctx, 'bafybeigTestCID123');

    expect(result).toMatchObject({
      cid: 'bafybeigTestCID123',
      status: 'pinned',
      providers: 3,
      retrievable: true,
    });
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('bafybeigTestCID123'));
  });

  test('handler propagates CID_NOT_FOUND errors', async () => {
    const { getPinStatus } = require('../../src/integration/filecoin-pin');
    const err = new Error('CID not found');
    err.code = 'CID_NOT_FOUND';
    getPinStatus.mockRejectedValueOnce(err);

    const ctx = { log: jest.fn() };
    await expect(filePinStatusSkill.handler(ctx, 'Qmbad')).rejects.toMatchObject({
      code: 'CID_NOT_FOUND',
    });
  });
});

describe('filePinRetrieveSkill (filePin.retrieve)', () => {
  test('has correct name and params', () => {
    expect(filePinRetrieveSkill.name).toBe('filePin.retrieve');
    expect(filePinRetrieveSkill.params).toContain('cid');
    expect(filePinRetrieveSkill.params).toContain('outputPath');
  });

  test('handler retrieves file and returns result', async () => {
    const ctx = { log: jest.fn() };
    const result = await filePinRetrieveSkill.handler(ctx, 'bafybeigTestCID123', '/tmp/output.txt');

    expect(result).toMatchObject({
      cid: 'bafybeigTestCID123',
      outputPath: '/tmp/output.txt',
      size: 512,
    });
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('/tmp/output.txt'));
  });
});

// ─── trustless skill ─────────────────────────────────────────────────────────────

const { trustlessVerifySkill } = require('../../src/skills/trustless');

jest.mock('../../src/policy/trustless', () => ({
  verifyAndRelease: jest.fn().mockResolvedValue({ status: 'Verification successful. Payment settled.', released: true, txHash: '0x123' })
}));

describe('trustlessVerifySkill (trustless.verifyAndRelease)', () => {
  test('has correct name and params', () => {
    expect(trustlessVerifySkill.name).toBe('trustless.verifyAndRelease');
    expect(trustlessVerifySkill.params).toContain('cid');
  });

  test('handler verifies and releases payment', async () => {
    const ctx = { log: jest.fn() };
    const result = await trustlessVerifySkill.handler(ctx, 'bafybeigTestCID123');
    expect(result.status).toBe('Verification successful. Payment settled.');
    expect(result.released).toBe(true);
  });
});

// ─── skills registry ──────────────────────────────────────────────────────────

const registry = require('../../src/skills/index');

describe('skills registry', () => {
  test('exports all skills as named exports', () => {
    expect(registry).toHaveProperty('filePinSkill');
    expect(registry).toHaveProperty('filePinStatusSkill');
    expect(registry).toHaveProperty('filePinRetrieveSkill');
    expect(registry).toHaveProperty('trustlessVerifySkill');
  });

  test('every exported skill has name, params, description, and handler', () => {
    Object.values(registry).forEach((skill) => {
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
      expect(Array.isArray(skill.params)).toBe(true);
      expect(typeof skill.handler).toBe('function');
    });
  });

  test('all skill names are unique', () => {
    const names = Object.values(registry).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── agent initialization ─────────────────────────────────────────────────────

describe('agent: initAgent + getAgent', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('initAgent returns an agent with invoke method', async () => {
    const { initAgent } = require('../../src/integration/agent');
    const agent = await initAgent();
    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');
  });

  test('initAgent is idempotent — returns same instance on second call', async () => {
    const { initAgent } = require('../../src/integration/agent');
    const a1 = await initAgent();
    const a2 = await initAgent();
    expect(a1).toBe(a2);
  });

  test('getAgent throws before initAgent is called', () => {
    const { getAgent } = require('../../src/integration/agent');
    expect(() => getAgent()).toThrow('Agent not initialized');
  });

  test('getAgent returns agent after initAgent', async () => {
    const { initAgent, getAgent } = require('../../src/integration/agent');
    await initAgent();
    const agent = getAgent();
    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');
  });

  test('agent.invoke dispatches filePin.upload skill', async () => {
    const { initAgent } = require('../../src/integration/agent');
    const agent = await initAgent();
    const result = await agent.invoke('filePin.upload', '/tmp/test.txt');
    expect(result.cid).toBe('bafybeigTestCID123');
    expect(result.status).toBe('pinned');
  });

  test('agent.invoke dispatches filePin.status skill', async () => {
    const { initAgent } = require('../../src/integration/agent');
    const agent = await initAgent();
    const result = await agent.invoke('filePin.status', 'bafybeigTestCID123');
    expect(result.status).toBe('pinned');
    expect(result.retrievable).toBe(true);
  });

  test('agent.invoke dispatches filePin.retrieve skill', async () => {
    const { initAgent } = require('../../src/integration/agent');
    const agent = await initAgent();
    const result = await agent.invoke('filePin.retrieve', 'bafybeigTestCID123', '/tmp/out.txt');
    expect(result.outputPath).toBe('/tmp/output.txt');
    expect(result.size).toBe(512);
  });

  test('agent.invoke throws for unknown skill name', async () => {
    const { initAgent } = require('../../src/integration/agent');
    const agent = await initAgent();
    await expect(agent.invoke('unknown.skill')).rejects.toThrow('Skill not found: unknown.skill');
  });
});
