'use strict';

const { filePinSkill, filePinStatusSkill, filePinRetrieveSkill } = require('./filePin');
const { escrowSkill } = require('./escrow');

module.exports = {
  filePinSkill,
  filePinStatusSkill,
  filePinRetrieveSkill,
  escrowSkill,
};
