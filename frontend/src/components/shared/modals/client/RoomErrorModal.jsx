import React from 'react';

const RoomErrorModal = ({ show, roomError, onNavigateToHome }) => {
  if (!show || !roomError) return null;

  return (
    <div className="client-container">
      <h2>La salle n'existe pas... 🫠</h2>
      <p>{roomError}</p>
      <button 
        className="btn btn-primary" 
        onClick={onNavigateToHome}
      >
        Retour à l'accueil
      </button>
    </div>
  );
};

export default RoomErrorModal;