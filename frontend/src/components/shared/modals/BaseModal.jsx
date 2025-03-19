// src/components/shared/modals/BaseModal.js
import React from 'react';

const BaseModal = ({ 
  show, 
  title,
  children, 
  isOverlay = false, 
  onClose = null,
  isDialog = true,
  dialogCentered = true,
  size = '',
}) => {
  if (!show) return null;
  
  if (isOverlay) {
    // Style pour les modales de type "overlay"
    return (
      <div className="overlay-container">
        <div className="overlay-content">
          <h3>{title}</h3>
          {children}
          {onClose && (
            <button
              className="btn btn-secondary mt-3"
              onClick={onClose}
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Style pour les modales de type "modal" standard (Bootstrap)
  return (
    <div
      className="modal show"
      style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className={`modal-dialog ${dialogCentered ? 'modal-dialog-centered' : ''} ${size ? `modal-${size}` : ''}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            {onClose && <button type="button" className="btn-close" onClick={onClose}></button>}
          </div>
          <div className="modal-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BaseModal;