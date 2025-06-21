import React from 'react';

const CloseRoomModal = ({ show, onConfirm, onCancel }) => {
  if (!show) return null;
  
  return (
    <div className="modal show">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Confirmer la fermeture</h5>
          </div>
          <div className="modal-body">
            <p>Êtes-vous sûr de vouloir fermer la salle ?</p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-success" onClick={onConfirm}>
              Oui
            </button>
            <button className="btn btn-danger" onClick={onCancel}>
              Non
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloseRoomModal;