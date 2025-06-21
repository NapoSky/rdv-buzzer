// src/controllers/roomController.js
const { Room } = require('../models/Room');
const logger = require('../utils/logger');
const { getIO } = require('../socket/index');
const roomService = require('../services/roomService');

async function listAllRooms(req, res) {
  try {
    const rooms = Room.getAll();
    res.json(rooms);
  } catch (err) {
    logger.error('ROOMS', 'Erreur lors de la récupération des salles', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

async function closeRoom(req, res) {
  const { roomCode } = req.body;
  
  try {
    // CORRECTION : Récupérer l'option saveRoom de la salle
    const room = Room.get(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Salle inexistante' });
    }
    
    // Respecter l'option saveRoom de la salle
    const shouldSave = room.options?.saveRoom ?? true;
    
    // Utiliser le service commun avec l'option correcte
    const result = await roomService.closeRoom(roomCode, getIO(), shouldSave);
    
    if (!result.success) {
      return res.status(404).json({ 
        error: result.error,
        dataSaved: result.dataSaved 
      });
    }
    
    res.json({ 
      success: true,
      dataSaved: result.dataSaved // Indiquer si les données ont été sauvegardées
    });
  } catch (err) {
    logger.error('ROOMS', 'Erreur lors de la fermeture de la salle', err);
    res.status(500).json({ 
      error: 'Erreur interne du serveur',
      dataSaved: false 
    });
  }
}

async function kickPlayer(req, res) {
  const { roomCode, playerId } = req.body;
  
  if (!Room.get(roomCode)) {
    return res.status(404).json({ error: 'Salle inexistante' });
  }
  
  const room = Room.get(roomCode);
  if (!room.players[playerId]) {
    return res.status(404).json({ error: 'Joueur inexistant' });
  }
  
  try {
    const kickedPseudo = room.players[playerId].pseudo;
    
    // Notifier le joueur à exclure
    const io = getIO();
    io.to(playerId).emit('kicked', { roomCode });
    
    // Supprimer le joueur de la salle
    Room.removePlayer(roomCode, playerId);
    
    // Mettre à jour pour les autres joueurs
    io.to(roomCode).emit('update_players', room.players);
    
    res.json({ success: true, kickedPseudo });
  } catch (err) {
    logger.error('ROOMS', 'Erreur lors de l\'expulsion du joueur', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

module.exports = {
  listAllRooms,
  closeRoom,
  kickPlayer
};