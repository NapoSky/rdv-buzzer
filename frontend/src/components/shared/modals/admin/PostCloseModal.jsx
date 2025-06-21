import React from 'react';

const PostCloseModal = ({ 
  show, 
  closeStatus, 
  onClose 
}) => {
  if (!show) return null;
  
  // Fonction pour déterminer le message de sauvegarde
  const getSaveMessage = () => {
    if (closeStatus.saveRequested === false) {
      // L'utilisateur n'a pas voulu sauvegarder
      return '📝 Salle non sauvegardée';
    } else if (closeStatus.dataSaved === true) {
      // L'utilisateur voulait sauvegarder et ça a marché
      return '✔️ Données sauvegardées';
    } else {
      // L'utilisateur voulait sauvegarder mais ça a échoué
      return '❌ Échec de la sauvegarde';
    }
  };
  
  return (
    <div className="modal show" style={{ backgroundColor: 'rgba(0,0,0,0.5)', display: 'block' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Salle fermée</h5>
          </div>
          <div className="modal-body">
            <p>Status de fermeture : {closeStatus.roomClosed ? '✔️ Salle fermée' : '❌ Salle non fermée'}</p>
            <p>Status de sauvegarde : {getSaveMessage()}</p>
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