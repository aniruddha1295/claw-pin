/**
 * init.js — `claw-pin init` command
 *
 * Generates a new Filecoin-compatible wallet and saves credentials
 * to .env.wallet in the project root.
 */

'use strict';

const ora = require('ora');
const logger = require('../logger');
const { createMainnetWallet, maskPrivateKey } = require('../../wallet/mainnet');

/**
 * Handler for: claw-pin init [--force]
 *
 * @param {{ force: boolean }} options
 */
async function initCommand(options = {}) {
  logger.info('Initializing claw-pin wallet…');
  const spinner = ora('Generating wallet key pair…').start();

  try {
    const result = await createMainnetWallet({
      force: options.force || false,
    });

    spinner.succeed('Wallet created successfully!');
    logger.divider();
    logger.field('Address', result.address);
    logger.field('Private Key', maskPrivateKey(result.privateKey));
    logger.field('Saved To', result.envPath);
    logger.divider();

    logger.info('Next steps:');
    logger.info('  1. Fund your wallet with test FIL:');
    logger.info('     → https://faucet.calibnet.chainsafe-fil.io/funds.html');
    logger.info('  2. Get test USDFC for storage payments:');
    logger.info('     → https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc');
    logger.info('  3. Get Base Sepolia ETH for escrow:');
    logger.info('     → Use a Base Sepolia faucet');
    logger.info('');
    logger.warn('⚠️  NEVER share your private key or commit .env.wallet to git!');
    logger.success('Wallet ready. You can now use `claw-pin upload` and `claw-pin upload --escrow`.');

    return result;
  } catch (err) {
    spinner.fail('Wallet initialization failed.');

    if (err.code === 'WALLET_EXISTS') {
      logger.warn(`Wallet already exists: ${err.existingAddress}`);
      logger.info('Use --force to overwrite the existing wallet.');
    } else {
      logger.error(`Failed to create wallet: ${err.message}`, err);
    }

    process.exitCode = 1;
    return null;
  }
}

module.exports = { initCommand };
