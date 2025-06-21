import React from 'react';
import BaseModal from '../BaseModal';
import FilteredPlayerList from '../../FilteredPlayerList';
import PlayerListItem from '../../PlayerListItem';

const UpdateScoreModal = ({ show, players, scoreUpdates, onScoreChange, onUpdateScore, onClose }) => {
  return (
    <BaseModal show={show} title="Modifier un score" isOverlay={true} onClose={onClose}>
      <FilteredPlayerList
        players={players}
        className="update-score-list" // Vous pouvez ajouter des classes spécifiques si nécessaire
        renderItem={(playerId, player) => (
          <PlayerListItem
            key={playerId}
            playerId={playerId}
            player={player}
            // Afficher le score actuel à côté du pseudo
            additionalInfo={`Score: ${player.score}`}
          >
            {/* Utiliser flexbox pour aligner l'input et le bouton */}
            <div className="d-flex align-items-center ms-auto">
              <input
                type="number"
                className="form-control form-control-sm me-2" // Utiliser les classes Bootstrap pour l'input
                placeholder="Nouveau score"
                value={scoreUpdates[playerId] ?? ''} // Utiliser ?? pour gérer null/undefined
                onChange={(e) => onScoreChange(playerId, e.target.value)}
                style={{ width: '80px' }} // Ajuster la largeur si nécessaire
              />
              <button
                className="btn btn-sm btn-success"
                onClick={() => onUpdateScore(playerId)}
                // Désactiver le bouton si aucune valeur n'est entrée ou si elle est identique au score actuel
                disabled={scoreUpdates[playerId] === undefined || scoreUpdates[playerId] === null || scoreUpdates[playerId] === '' || Number(scoreUpdates[playerId]) === player.score}
              >
                Ok
              </button>
            </div>
          </PlayerListItem>
        )}
      />
    </BaseModal>
  );
};

export default UpdateScoreModal;