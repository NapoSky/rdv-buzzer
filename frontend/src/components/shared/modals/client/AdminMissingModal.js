import React from 'react';

const AdminMissingModal = ({ show }) => {
  if (!show) return null;
  
  return (
    <div
      className="modal show"
      style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Partie en pause ! 🫠</h5>
          </div>
          <div className="modal-body">
            <p>Aucun admin n'est présent. Vous ne pouvez pas buzzer pour l'instant.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMissingModal;