import React from 'react';

const PostCloseModal = ({ 
  show, 
  closeStatus, 
  onClose 
}) => {
  if (!show) return null;
  
  return (
    <div className="modal show" style={{ backgroundColor: 'rgba(0,0,0,0.5)', display: 'block' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Salle fermée</h5>
          </div>
          <div className="modal-body">
            <p>Status de fermeture : {closeStatus.roomClosed ? '✔️ Salle fermée' : '❌ Salle non fermée'}</p>
            <p>Status de sauvegarde : {closeStatus.dataSaved ? '✔️ Données sauvegardées' : '❌ Échec de la sauvegarde'}</p>
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-success"
              onClick={onClose}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostCloseModal;