'use strict';

const escrowSkill = {
  name: 'escrow.create',
  description: 'Creates an Alkahest escrow contract for conditional payment on a Filecoin CID',
  params: ['cid', 'amount'],
  // Dev 2 replaces this handler with alkahest-client logic
  handler: async (_ctx, _cid, _amount) => {
    throw new Error('escrow.create not implemented');
  },
};

module.exports = { escrowSkill };
