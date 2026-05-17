/**
 * status.js — `claw-pin status <CID>` command
 *
 * Queries the Filecoin network for the pin status of a given CID.
 */

const ora = require('ora');
const logger = require('../logger');
const { initAgent, getAgent } = require('../../integration/agent');

/**
 * Handler for: claw-pin status <cid>
 *
 * @param {string} cid — the Content Identifier to query
 */
async function statusCommand(cid) {
  if (!cid || cid.trim() === '') {
    logger.error('Please provide a CID. Usage: claw-pin status <CID>');
    process.exitCode = 1;
    return null;
  }

  logger.info(`Querying pin status for CID: ${cid}`);
  const spinner = ora('Fetching status from Filecoin…').start();

  try {
    await initAgent();
    const agent = getAgent();
    const result = await agent.invoke('filePin.status', cid.trim());

    spinner.succeed('Status retrieved!');
    logger.divider();
    logger.field('CID', result.cid);
    logger.field('Status', result.status);
    logger.field('Providers', String(result.providers));
    logger.field('Retrievable', result.retrievable ? 'Yes' : 'No');
    logger.divider();

    return result;
  } catch (err) {
    spinner.fail('Status query failed.');

    if (err.code === 'CID_NOT_FOUND') {
      logger.error(`CID not found on the network: "${cid}". Verify the CID is correct.`, err);
    } else if (err.code === 'INVALID_CID') {
      logger.error('Invalid CID format. A valid CID starts with "bafybeig…".', err);
    } else {
      logger.error(`Unexpected error querying status: ${err.message}`, err);
    }

    process.exitCode = 1;
    return null;
  }
}

module.exports = { statusCommand };
