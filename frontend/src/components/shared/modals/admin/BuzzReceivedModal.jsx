// src/components/shared/modals/BuzzReceivedModal.js
import React from 'react';
import BaseModal from '../BaseModal';

// Ajouter foundArtist et foundTitle aux props
const BuzzReceivedModal = ({ show, pseudo, roomType, onJudgeResponse, onPass, foundArtist, foundTitle }) => {
  return (
    <BaseModal show={show} title="Buzz reçu">
      <p><b>{pseudo}</b> a buzzé !</p>
      <p><i>Type de jeu : {roomType}</i></p>

      <div className="modal-footer d-flex flex-wrap justify-content-center"> {/* Utiliser flex-wrap pour les petits écrans */}
        {roomType === 'Standard' ? (
          <>
            <button
              className="btn btn-success m-1" // Ajouter marge
              onClick={() => onJudgeResponse('correct')} // Utiliser 'correct'
            >
              Bonne réponse
            </button>
            <button
              className="btn btn-danger m-1" // Ajouter marge
              onClick={() => onJudgeResponse('incorrect')} // Utiliser 'incorrect'
            >
              Mauvaise réponse
            </button>
          </>
        ) : ( // Cas 'Titre/Artiste'
          <>
            {/* Afficher "Bon titre" seulement si le titre n'est PAS trouvé */}
            {!foundTitle && (
              <button
                className="btn btn-info m-1" // Couleur différente pour titre/artiste
                onClick={() => onJudgeResponse('correct_title')}
              >
                Bon titre
              </button>
            )}
            {/* Afficher "Bon artiste" seulement si l'artiste n'est PAS trouvé */}
            {!foundArtist && (
              <button
                className="btn btn-info m-1"
                onClick={() => onJudgeResponse('correct_artist')}
              >
                Bon artiste
              </button>
            )}
            {/* Afficher "Tout est bon" seulement si NI titre NI artiste ne sont trouvés */}
            {!foundArtist && !foundTitle && (
              <button
                className="btn btn-success m-1"
                onClick={() => onJudgeResponse('correct_both')} // Jugement pour les deux corrects
              >
                Tout est bon
              </button>
            )}
            {/* "Mauvaise réponse" s'affiche toujours */}
            <button
              className="btn btn-danger m-1"
              onClick={() => onJudgeResponse('incorrect')}
            >
              Mauvaise réponse
            </button>
          </>
        )}
        {/* Bouton Passer commun */}
        <button
          className="btn btn-secondary m-1"
          onClick={onPass}
        >
          Passer / Annuler
        </button>
      </div>
    </BaseModal>
  );
};

export default BuzzReceivedModal;