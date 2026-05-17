/**
 * retrieve.js — `claw-pin retrieve <CID> <outputPath>` command
 *
 * Downloads a pinned file from Filecoin to a local path.
 */

const ora = require('ora');
const logger = require('../logger');
const { initAgent, getAgent } = require('../../integration/agent');

/**
 * Handler for: claw-pin retrieve <cid> <outputPath>
 *
 * @param {string} cid — the Content Identifier to retrieve
 * @param {string} outputPath — local path to write the file
 */
async function retrieveCommand(cid, outputPath) {
  if (!cid || cid.trim() === '') {
    logger.error('Please provide a CID. Usage: claw-pin retrieve <CID> <outputPath>');
    process.exitCode = 1;
    return null;
  }

  if (!outputPath || outputPath.trim() === '') {
    logger.error('Please provide an output path. Usage: claw-pin retrieve <CID> <outputPath>');
    process.exitCode = 1;
    return null;
  }

  logger.info(`Retrieving CID: ${cid} → ${outputPath}`);
  const spinner = ora('Downloading from Filecoin…').start();

  try {
    await initAgent();
    const agent = getAgent();
    const result = await agent.invoke('filePin.retrieve', cid.trim(), outputPath.trim());

    spinner.succeed('File retrieved successfully!');
    logger.divider();
    logger.field('CID', result.cid);
    logger.field('Saved to', result.outputPath);
    logger.field('Size', `${result.size} bytes`);
    logger.divider();
    logger.success(`Retrieval complete. File saved to: ${result.outputPath}`);

    return result;
  } catch (err) {
    spinner.fail('Retrieval failed.');

    if (err.code === 'CID_NOT_FOUND') {
      logger.error(`CID not found on the network: "${cid}". Verify the CID is correct.`, err);
    } else if (err.code === 'INVALID_CID') {
      logger.error('Invalid CID format.', err);
    } else if (err.code === 'EACCES') {
      logger.error(`Permission denied writing to: "${outputPath}".`, err);
    } else {
      logger.error(`Unexpected error during retrieval: ${err.message}`, err);
    }

    process.exitCode = 1;
    return null;
  }
}

module.exports = { retrieveCommand };
