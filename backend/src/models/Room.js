// Structure en mémoire pour les salles
let rooms = {};

class Room {
  static create(roomCode, adminId) {
    rooms[roomCode] = {
      adminId,
      players: {},
      paused: false,
      firstBuzz: null,
      lastBuzz: null
    };
    return rooms[roomCode];
  }

  static get(roomCode) {
    return rooms[roomCode];
  }

  static getAll() {
    return rooms;
  }

  static delete(roomCode) {
    const room = rooms[roomCode];
    delete rooms[roomCode];
    return room;
  }

  static addPlayer(roomCode, socketId, playerData) {
    if (!rooms[roomCode]) return null;
    rooms[roomCode].players[socketId] = playerData;
    return rooms[roomCode].players[socketId];
  }

  static removePlayer(roomCode, socketId) {
    if (!rooms[roomCode] || !rooms[roomCode].players[socketId]) return false;
    delete rooms[roomCode].players[socketId];
    return true;
  }

  static updatePlayerStatus(roomCode, socketId, status) {
    if (!rooms[roomCode] || !rooms[roomCode].players[socketId]) return false;
    rooms[roomCode].players[socketId] = { ...rooms[roomCode].players[socketId], ...status };
    return rooms[roomCode].players[socketId];
  }

  static setAdminId(roomCode, socketId) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].adminId = socketId;
    return true;
  }

  static setPaused(roomCode, isPaused) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].paused = isPaused;
    return true;
  }

  static setBuzz(roomCode, buzzData) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].lastBuzz = buzzData;
    return true;
  }

  static resetBuzz(roomCode) {
    if (!rooms[roomCode]) return false;
    const room = rooms[roomCode];
    room.firstBuzz = null;
    room.lastBuzz = null;
    return true;
  }

  static clearBuzz(roomCode) {
    return this.resetBuzz(roomCode);
  }

  static setFirstBuzz(roomCode, socketId) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].firstBuzz = socketId;
    return true;
  }

  static setLastBuzz(roomCode, buzzData) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].lastBuzz = buzzData;
    return true;
  }
}

module.exports = {
  Room,
  buzzerGracePeriods: {}  // Pour la période de grâce des buzzers
};