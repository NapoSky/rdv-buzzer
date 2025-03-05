const Ranking = require('../models/Ranking');
const { getFormattedTimestamp } = require('../utils/helpers');
const logger = require('../utils/logger');

async function getGlobalRanking(req, res) {
  try {
    let rankingArray = await Ranking.load();
    // Filtrez les entrées non-admin
    rankingArray = rankingArray.filter(player => !player.isAdmin);

    const { month, year, from, to, raw } = req.query;

    let filteredRanking = rankingArray;
    if (month && year) {
      filteredRanking = await Ranking.filterByMonthYear(month, year);
    } else if (year) {
      filteredRanking = await Ranking.filterByYear(year);
    } else if (from && to) {
      filteredRanking = await Ranking.filterByDate(from, to);
    }
    
    // Si raw est présent, renvoyer les entrées filtrées et individuelles
    if (raw) {
      return res.json(filteredRanking);
    }
    
    const aggregatedRanking = await Ranking.getAggregated(filteredRanking);
    res.json(aggregatedRanking);
  } catch (err) {
    logger.error('RANKING', 'Erreur lors de la récupération du classement', err);
    res.status(500).json({ error: 'Erreur interne du serveur (Redis)' });
  }
}

async function saveGlobalRanking(req, res) {
  let { ranking } = req.body;
  if (!ranking) {
    return res.status(400).json({ error: 'Classement manquant' });
  }
  
  // Ajout du timestamp si absent
  ranking = ranking.map(player => ({
    ...player,
    timestamp: player.timestamp || getFormattedTimestamp()
  }));
  
  try {
    await Ranking.save(ranking);
    res.json({ success: true });
  } catch (err) {
    logger.error('RANKING', 'Erreur lors de la sauvegarde du classement', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

async function deletePseudo(req, res) {
  const { pseudo } = req.body;
  if (!pseudo) {
    return res.status(400).json({ error: 'Pseudo manquant' });
  }
  
  try {
    let ranking = await Ranking.load();
    const newRanking = ranking.filter(entry => entry.pseudo !== pseudo);
    await Ranking.save(newRanking);
    res.json({ success: true });
  } catch (err) {
    logger.error('RANKING', 'Erreur lors de la suppression du pseudo', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

async function modifyEntry(req, res) {
  const { pseudo, entryIndex, score } = req.body;
  if (!pseudo || entryIndex === undefined) {
    return res.status(400).json({ error: 'Pseudo et index d\'entrée obligatoires' });
  }
  
  try {
    let ranking = await Ranking.load();
    // Récupérer la liste des entrées correspondant au pseudo
    const entriesForPseudo = ranking.filter(entry => entry.pseudo === pseudo);
    if (entriesForPseudo.length === 0 || entryIndex < 0 || entryIndex >= entriesForPseudo.length) {
      return res.status(404).json({ error: 'Entrée non trouvée' });
    }
    
    // Déterminer l'index réel dans le tableau global
    let count = 0;
    let targetIndex = -1;
    for (let i = 0; i < ranking.length; i++) {
      if (ranking[i].pseudo === pseudo) {
        if (count === entryIndex) {
          targetIndex = i;
          break;
        }
        count++;
      }
    }
    
    if (targetIndex === -1) {
      return res.status(404).json({ error: 'Entrée non trouvée' });
    }
    
    // Si le score envoyé est vide ou invalide, on supprime l'entrée
    if (score === '' || isNaN(score)) {
      ranking.splice(targetIndex, 1);
    } else {
      ranking[targetIndex].score = Number(score);
      // Mettre à jour le timestamp si nécessaire
      ranking[targetIndex].timestamp = getFormattedTimestamp();
    }
    
    await Ranking.save(ranking);
    res.json({ success: true });
  } catch (err) {
    logger.error('RANKING', 'Erreur lors de la modification de l\'entrée', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

async function purgeRanking(req, res) {
  try {
    // On remplace le classement existant par un tableau vide
    await Ranking.save([]);
    res.json({ success: true });
  } catch (err) {
    logger.error('RANKING', 'Erreur lors de la purge du classement', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
}

async function closeRoom(req, res) {
  const { roomCode } = req.body;
  const { Room } = require('../models/Room');
  const room = Room.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Salle inexistante' });
  }

  // Extraire les joueurs non-admin de la salle
  const players = Object.values(room.players).filter(player => !player.isAdmin);

  // Charger le classement global actuel depuis Redis
  let currentRanking = await Ranking.load();

  // Mettre à jour le classement global en ajoutant les scores des joueurs de la salle fermée
  for (const player of players) {
    currentRanking.push({
      pseudo: player.pseudo,
      score: player.score,
      isAdmin: false,
      timestamp: getFormattedTimestamp() // timestamp propre à cet ajout
    });
  }

  // Sauvegarder le classement global mis à jour dans Redis
  await Ranking.save(currentRanking);

  // Fermer la salle
  const io = require('../socket').getIO();
  io.to(roomCode).emit('room_closed');
  Room.delete(roomCode);

  res.json({ success: true });
}

module.exports = {
  getGlobalRanking,
  saveGlobalRanking,
  deletePseudo,
  modifyEntry,
  purgeRanking,
  closeRoom
};