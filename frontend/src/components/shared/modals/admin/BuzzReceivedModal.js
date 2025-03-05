// src/components/shared/modals/BuzzReceivedModal.js
import React from 'react';
import BaseModal from '../BaseModal';

const BuzzReceivedModal = ({ show, pseudo, onCorrectAnswer, onWrongAnswer, onPass }) => {
  return (
    <BaseModal show={show} title="Buzz reçu">
      <p>{pseudo} a buzzé !</p>
      
      <div className="modal-footer">
        <button
          class="btn btn-success"
          onClick={onCorrectAnswer}
        >
          Bonne réponse
        </button>
        <button
          class="btn btn-danger"
          onClick={onWrongAnswer}
        >
          Mauvaise réponse
        </button>
        <button
          class="btn btn-secondary"
          onClick={onPass}
        >
          Passer
        </button>
      </div>
    </BaseModal>
  );
};

export default BuzzReceivedModal;