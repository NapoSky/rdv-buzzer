// src/routes/spotifyRoutes.js
const express = require('express');
const spotifyController = require('../controllers/spotifyController');
const { verifyAdminAuth } = require('../middlewares/auth');

const router = express.Router();

// Routes d'authentification et de callback
router.get('/auth-url/:roomCode', verifyAdminAuth, spotifyController.getAuthUrl);
router.get('/callback', spotifyController.handleCallback);

// Routes de gestion Spotify
router.get('/status/:roomCode', verifyAdminAuth, spotifyController.getStatus);
router.post('/disconnect/:roomCode', verifyAdminAuth, spotifyController.disconnectSpotify);
router.get('/devices/:roomCode', verifyAdminAuth, spotifyController.getDevices);
router.post('/pause/:roomCode', verifyAdminAuth, spotifyController.pausePlayback);
router.post('/play/:roomCode', verifyAdminAuth, spotifyController.resumePlayback);

module.exports = router;