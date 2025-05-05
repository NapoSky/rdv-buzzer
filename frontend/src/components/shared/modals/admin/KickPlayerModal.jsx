import React from 'react';
import BaseModal from '../BaseModal';
import FilteredPlayerList from '../../FilteredPlayerList';
import PlayerListItem from '../../PlayerListItem';

const KickPlayerModal = ({ show, players, onKick, onClose }) => {
  return (
    <BaseModal show={show} title="Kicker un joueur" isOverlay={true} onClose={onClose}>
      <FilteredPlayerList
        players={players}
        className="kick-list" // Vous pouvez ajouter des classes spécifiques si nécessaire
        renderItem={(playerId, player) => (
          <PlayerListItem
            key={playerId}
            playerId={playerId}
            player={player}
            // Pas d'info additionnelle nécessaire ici par défaut
          >
            {/* Utiliser flexbox pour aligner le bouton à droite */}
            <div className="d-flex align-items-center ms-auto">
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onKick(playerId)}
              >
                Kick
              </button>
            </div>
          </PlayerListItem>
        )}
      />
    </BaseModal>
  );
};

export default KickPlayerModal;