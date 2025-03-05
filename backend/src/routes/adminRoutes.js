// src/routes/adminRoutes.js
const express = require('express');
const { verifyAdminAuth } = require('../middlewares/auth');
const roomController = require('../controllers/roomController');
const rankingController = require('../controllers/rankingController');

const router = express.Router();

// Protection de toutes les routes admin
router.use(verifyAdminAuth);

// Routes pour la gestion des salles
router.get('/sessions', roomController.listAllRooms);
router.post('/closeRoom', roomController.closeRoom);
router.post('/kickPlayer', roomController.kickPlayer);

// Routes pour la gestion du classement
router.post('/saveGlobalRanking', rankingController.saveGlobalRanking);
router.post('/deletePseudo', rankingController.deletePseudo);
router.post('/modifyEntry', rankingController.modifyEntry);
router.post('/purgeRanking', rankingController.purgeRanking);

module.exports = router;