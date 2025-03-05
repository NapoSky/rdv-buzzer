// src/routes/index.js
const express = require('express');
const adminRoutes = require('./adminRoutes');
const rankingRoutes = require('./rankingRoutes');
const roomRoutes = require('./roomRoutes');
const spotifyRoutes = require('./spotifyRoutes');

const router = express.Router();

// Montage des différentes routes
router.use('/admin', adminRoutes);
router.use('/ranking', rankingRoutes);
router.use('/rooms', roomRoutes);
router.use('/spotify', spotifyRoutes);

module.exports = router;