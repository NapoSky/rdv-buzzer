// src/routes/roomRoutes.js
const express = require('express');
const roomController = require('../controllers/roomController');
const { verifyAdminAuth } = require('../middlewares/auth');

const router = express.Router();

// Routes pour la gestion des salles
router.get('/list', verifyAdminAuth, roomController.listAllRooms);
router.post('/close', verifyAdminAuth, roomController.closeRoom);
router.post('/kickPlayer', verifyAdminAuth, roomController.kickPlayer);

module.exports = router;