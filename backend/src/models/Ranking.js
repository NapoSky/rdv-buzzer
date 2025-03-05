const { client: redisClient } = require('../config/db');
const logger = require('../utils/logger');

class Ranking {
  static async save(ranking) {
    try {
      if (!redisClient.isOpen) {
        logger.warn('REDIS', 'Redis non connecté lors de la sauvegarde du classement');
        return false;
      }
      await redisClient.set('globalRanking', JSON.stringify(ranking));
      return true;
    } catch (error) {
      logger.error('REDIS', 'Erreur lors de la sauvegarde du classement', error);
      return false;
    }
  }

  static async load() {
    try {
      if (!redisClient.isOpen) {
        logger.warn('REDIS', 'Redis non connecté lors du chargement du classement');
        return [];
      }
      const data = await redisClient.get('globalRanking');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.error('REDIS', 'Erreur lors du chargement du classement', error);
      return [];
    }
  }

  static async filterByDate(from, to) {
    const ranking = await this.load();
    return ranking.filter(player => {
      if (player.timestamp) {
        const parts = player.timestamp.split("-");
        const day = parts[0], monthPart = parts[1], yearPart = "20" + parts[2];
        const playerDate = new Date(`${yearPart}-${monthPart}-${day}`);
        const fromDate = new Date(from);
        const toDate = new Date(to);
        return playerDate >= fromDate && playerDate <= toDate;
      }
      return false;
    });
  }

  static async filterByYear(year) {
    const ranking = await this.load();
    return ranking.filter(player => {
      if (player.timestamp) {
        const parts = player.timestamp.split("-");
        return parts[2] === year.slice(-2);
      }
      return false;
    });
  }

  static async filterByMonthYear(month, year) {
    const ranking = await this.load();
    return ranking.filter(player => {
      if (player.timestamp) {
        const parts = player.timestamp.split("-");
        return parts[1] === month && parts[2] === year.slice(-2);
      }
      return false;
    });
  }

  static async getAggregated(filteredRanking = null) {
    const ranking = filteredRanking || await this.load();
    const aggregated = ranking.reduce((acc, entry) => {
      if (!entry.isAdmin) {
        if (acc[entry.pseudo]) {
          acc[entry.pseudo].score += entry.score;
        } else {
          acc[entry.pseudo] = { pseudo: entry.pseudo, score: entry.score };
        }
      }
      return acc;
    }, {});

    const aggregatedRanking = Object.values(aggregated);
    aggregatedRanking.sort((a, b) => b.score - a.score);
    return aggregatedRanking;
  }
}

module.exports = Ranking;