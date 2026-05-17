#!/usr/bin/env node
/**
 * index.js — Main CLI entry point for claw-pin
 *
 * Registers all subcommands and delegates to individual command handlers.
 * Built with Commander.js for clean argument parsing.
 */

'use strict';

require('dotenv').config();
// Also load .env.wallet if it exists (Dev 2 wallet credentials)
require('dotenv').config({ path: '.env.wallet' });

const { Command } = require('commander');
const { uploadCommand } = require('./cmd/upload');
const { statusCommand } = require('./cmd/status');
const { retrieveCommand } = require('./cmd/retrieve');
const { initCommand } = require('./cmd/init');
const logger = require('./logger');
const { initAgent } = require('../integration/agent');

const program = new Command();

program
  .name('claw-pin')
  .description('🏆 Agentic File Storage CLI — Trustless file pinning with Filecoin + OpenClaw')
  .version('1.0.0', '-v, --version', 'Output the current version');

// ─── init ────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Generate a new Filecoin-compatible wallet and save credentials')
  .option('--force', 'Overwrite existing wallet')
  .action(async (options) => {
    await initCommand(options);
  });

// ─── upload ──────────────────────────────────────────────────────────────────
program
  .command('upload <file>')
  .description('Pin a local file to Filecoin decentralised storage')
  .option('--trustless', 'Verify file pin autonomously and release a trustless conditional payment')
  .action(async (file, options) => {
    await uploadCommand(file, options);
  });

// ─── status ──────────────────────────────────────────────────────────────────
program
  .command('status <cid>')
  .description('Query the pin status of a CID on Filecoin')
  .action(async (cid) => {
    await statusCommand(cid);
  });

// ─── retrieve ────────────────────────────────────────────────────────────────
program
  .command('retrieve <cid> <outputPath>')
  .description('Download a pinned file by CID to a local path')
  .action(async (cid, outputPath) => {
    await retrieveCommand(cid, outputPath);
  });

// ─── Global error catch ───────────────────────────────────────────────────────
initAgent()
  .then(() => program.parseAsync(process.argv))
  .catch((err) => {
    logger.error(`Fatal CLI error: ${err.message}`, err);
    process.exit(1);
  });
