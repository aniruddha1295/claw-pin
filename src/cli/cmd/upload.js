/**
 * upload.js — `claw-pin upload <file>` command
 *
 * Pins a local file to Filecoin via the integration wrapper.
 * Supports an optional --escrow flag (scaffolded; Dev 2 wires the logic).
 */

const ora = require('ora');
const path = require('path');
const logger = require('../logger');
const { initAgent, getAgent } = require('../../integration/agent');

/**
 * Handler for: claw-pin upload <file> [--escrow]
 *
 * @param {string} file — path provided by the user
 * @param {{ escrow: boolean }} options
 */
async function uploadCommand(file, options = {}) {
  const resolvedPath = path.resolve(file);

  logger.info(`Preparing to upload: ${resolvedPath}`);
  if (options.escrow) {
    logger.warn('Escrow mode enabled — Dev 2 escrow logic will be invoked after pinning.');
  }

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
