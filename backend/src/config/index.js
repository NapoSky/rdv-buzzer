// src/config/index.js
const db = require('./db');
const socket = require('./socket');
const spotify = require('./spotify');

module.exports = {
  db,
  socket,
  spotify
};