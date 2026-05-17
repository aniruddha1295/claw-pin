/**
 * upload.js — `claw-pin upload <file>` command
 *
 * Pins a local file to Filecoin via the integration wrapper.
 * Supports --trustless flag for trustless token flow.
 */

const ora = require('ora');
const path = require('path');
const logger = require('../logger');
const { initAgent, getAgent } = require('../../integration/agent');

/**
 * Handler for: claw-pin upload <file> [--trustless]
 *
 * @param {string} file — path provided by the user
 * @param {{ trustless: boolean }} options
 */
async function uploadCommand(file, options = {}) {
  const resolvedPath = path.resolve(file);

  logger.info(`Preparing to upload: ${resolvedPath}`);

  const spinner = ora('Pinning file to Filecoin…').start();

  try {
    await initAgent();
    const agent = getAgent();
    const result = await agent.invoke('filePin.upload', resolvedPath);

    spinner.succeed('File pinned successfully!');
    logger.divider();
    logger.field('CID', result.cid);
    logger.field('Status', result.status);
    logger.field('File Size', `${result.size} bytes`);
    logger.field('Estimated Cost', result.cost);
    logger.field('Providers', String(result.providers));
    logger.divider();
    logger.success(`Pin complete. CID: ${result.cid}`);

    // ─── Trustless Flow Integration ──────────────────────────
    if (options.trustless) {
      const walletAddress = process.env.WALLET_ADDRESS;
      if (!walletAddress) {
        logger.warn('No WALLET_ADDRESS found. Run `claw-pin init` first to create a wallet.');
        logger.warn('Skipping trustless payment setup.');
      } else {
        logger.info('Trustless Payment Flow activated.');
        const trustlessSpinner = ora('Verifying pin to release payment conditionally…').start();
        try {
          // Instead of calling escrow.create, we call the trustless verification logic directly
          // We can route this through an agent skill named 'trustless.verifyAndRelease'
          const payoutResult = await agent.invoke('trustless.verifyAndRelease', result.cid);
          trustlessSpinner.succeed('Verification passed & Payment Released!');
          logger.divider();
          logger.field('Tx Hash', payoutResult.txHash);
          logger.field('Status', payoutResult.status);
          if (payoutResult.note) {
            logger.warn(payoutResult.note);
          }
          logger.divider();
          logger.success('Trustless token transaction verified autonomously.');
        } catch (err) {
          trustlessSpinner.fail('Trustless flow failed to verify or release.');
          logger.error(`Error: ${err.message}`, err);
          logger.warn('File was pinned successfully, but payment step failed.');
        }
      }
    }

    return result; // allows programmatic/test access
  } catch (err) {
    spinner.fail('Upload failed.');

    if (err.code === 'FILE_NOT_FOUND') {
      logger.error(`File not found: "${file}". Please check the path and try again.`, err);
    } else if (err.code === 'EACCES') {
      logger.error(`Permission denied reading: "${file}".`, err);
    } else {
      logger.error(`Unexpected error during upload: ${err.message}`, err);
    }

    process.exitCode = 1;
    return null;
  }
}

module.exports = { uploadCommand };
