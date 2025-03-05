// backend/src/routes/rankingRoutes.js
const express = require('express');
const rankingController = require('../controllers/rankingController');
const { verifyAdminAuth } = require('../middlewares/auth');

const router = express.Router();

// Route publique pour récupérer le classement global
router.get('/', rankingController.getGlobalRanking);

// Routes protégées pour manipuler les données de classement
router.post('/save', verifyAdminAuth, rankingController.saveGlobalRanking);
router.post('/deletePseudo', verifyAdminAuth, rankingController.deletePseudo);
router.post('/modifyEntry', verifyAdminAuth, rankingController.modifyEntry);
router.post('/purge', verifyAdminAuth, rankingController.purgeRanking);

module.exports = router;