'use strict';

const { verifyAndRelease } = require('../policy/trustless');

const trustlessVerifySkill = {
  name: 'trustless.verifyAndRelease',
  description: 'Verifies a CID is pinned on Filecoin, releasing payment if true',
  params: ['cid'],
  handler: async (ctx, cid) => {
    ctx.log(`Initiating trustless verification for CID: ${cid}`);
    const result = await verifyAndRelease(cid);
    ctx.log(`Trustless verification complete. Status: ${result.status}`);
    return result;
  },
};

module.exports = { trustlessVerifySkill };