'use strict';

const { filePinSkill, filePinStatusSkill, filePinRetrieveSkill } = require('./filePin');
const { trustlessVerifySkill } = require('./trustless');

module.exports = {
  filePinSkill,
  filePinStatusSkill,
  filePinRetrieveSkill,
  trustlessVerifySkill,
};
