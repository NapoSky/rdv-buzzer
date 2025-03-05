//// filepath: /d:/foxhole_work/rdv-buzzer/frontend/src/services/roomService.js
export const closeRoomRequest = async (roomCode) => {
  const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rooms/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.REACT_APP_APP_SECRET}`
    },
    body: JSON.stringify({ roomCode })
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la fermeture de la salle');
  }
  return response.json();
};