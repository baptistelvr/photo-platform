const { createApp } = require('../src/app');

let appPromise;

module.exports = async function handler(req, res) {
  appPromise ||= createApp();
  const app = await appPromise;
  return app(req, res);
};
