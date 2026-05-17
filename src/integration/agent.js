'use strict';

const skills = require('../skills');

let agentInstance = null;

async function initAgent() {
  if (agentInstance) return agentInstance;

  // Build O(1) skill lookup map
  const skillMap = {};
  Object.values(skills).forEach((skill) => {
    skillMap[skill.name] = skill;
  });

  // Connect to OpenClaw Gateway (non-fatal if unavailable or ESM/CJS incompatible)
  let gatewayClient = null;
  try {
    const { createClient } = require('openclaw-sdk');
    gatewayClient = createClient({
      url: process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
      auth: { token: process.env.OPENCLAW_GATEWAY_TOKEN || '' },
    });
    await gatewayClient.connect();
  } catch (_err) {
    // Gateway is optional — CLI mode works without it
  }

  agentInstance = {
    gateway: gatewayClient,
    async invoke(skillName, ...args) {
      const skill = skillMap[skillName];
      if (!skill) throw new Error(`Skill not found: ${skillName}`);
      const ctx = { log: (msg) => console.log(msg) };
      return skill.handler(ctx, ...args);
    },
  };

  return agentInstance;
}

function getAgent() {
  if (!agentInstance) throw new Error('Agent not initialized. Call initAgent() first.');
  return agentInstance;
}

module.exports = { initAgent, getAgent };
