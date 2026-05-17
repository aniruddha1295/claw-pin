'use strict';

const { pinFile, getPinStatus, retrieveFile } = require('../integration/filecoin-pin');

const filePinSkill = {
  name: 'filePin.upload',
  description: 'Pins a file to the Filecoin network and returns its CID',
  params: ['filePath'],
  handler: async (ctx, filePath) => {
    ctx.log(`Pinning file: ${filePath}`);
    const result = await pinFile(filePath);
    ctx.log(`Pinned. CID: ${result.cid}`);
    return result;
  },
};

const filePinStatusSkill = {
  name: 'filePin.status',
  description: 'Queries the pin status of a CID on Filecoin',
  params: ['cid'],
  handler: async (ctx, cid) => {
    ctx.log(`Querying status for: ${cid}`);
    const result = await getPinStatus(cid);
    ctx.log(`Status: ${result.status}`);
    return result;
  },
};

const filePinRetrieveSkill = {
  name: 'filePin.retrieve',
  description: 'Downloads a pinned file by CID to a local path',
  params: ['cid', 'outputPath'],
  handler: async (ctx, cid, outputPath) => {
    ctx.log(`Retrieving CID: ${cid} → ${outputPath}`);
    const result = await retrieveFile(cid, outputPath);
    ctx.log(`Retrieved. Saved to: ${result.outputPath}`);
    return result;
  },
};

module.exports = { filePinSkill, filePinStatusSkill, filePinRetrieveSkill };
