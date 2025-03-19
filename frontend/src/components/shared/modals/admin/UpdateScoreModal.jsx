import React from 'react';
import BaseModal from '../BaseModal';
import FilteredPlayerList from '../../FilteredPlayerList';
import PlayerListItem from '../../PlayerListItem';

const UpdateScoreModal = ({ show, players, scoreUpdates, onScoreChange, onUpdateScore, onClose }) => {
  return (
    <BaseModal show={show} title="Modifier un score" isOverlay={true} onClose={onClose}>
      <FilteredPlayerList 
        players={players}
        className="update-score-list"
        renderItem={(playerId, player) => (
          <PlayerListItem 
            key={playerId}
            playerId={playerId}
            player={player}
            additionalInfo={` ${player.score}`}
          >
            <div>
              <input
                type="number"
                placeholder="Nouveau score"
                value={scoreUpdates[playerId] || ''}
                onChange={(e) => onScoreChange(playerId, e.target.value)}
                style={{ width: '100px', marginRight: '10px' }}
              />
              <button
                className="btn btn-sm btn-success"
                onClick={() => onUpdateScore(playerId)}
              >
                Update
              </button>
            </div>
          </PlayerListItem>
        )}
      />
    </BaseModal>
  );
};

export default UpdateScoreModal;