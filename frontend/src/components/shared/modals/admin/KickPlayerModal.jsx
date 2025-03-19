import React from 'react';
import BaseModal from '../BaseModal';
import FilteredPlayerList from '../../FilteredPlayerList';
import PlayerListItem from '../../PlayerListItem';

const KickPlayerModal = ({ show, players, onKick, onClose }) => {
  return (
    <BaseModal show={show} title="Kicker un joueur" isOverlay={true} onClose={onClose}>
      <FilteredPlayerList 
        players={players}
        className="kick-list"
        renderItem={(playerId, player) => (
          <PlayerListItem 
            key={playerId}
            playerId={playerId}
            player={player}
          >
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onKick(playerId)}
            >
              Kick
            </button>
          </PlayerListItem>
        )}
      />
    </BaseModal>
  );
};

export default KickPlayerModal;