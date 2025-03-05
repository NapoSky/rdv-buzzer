// src/components/shared/RankingTable.js
import React from 'react';

const RankingTable = ({ players, currentUser = null, showPosition = true }) => {
  return (
    <div className="ranking-scroll">
      <table className="table table-striped table-hover">
        <thead>
          <tr>
            {showPosition && <th>Position</th>}
            <th>Pseudo</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr key={index} className={player.pseudo === currentUser ? "current-player" : ""}>
              {showPosition && <td>{index + 1}</td>}
              <td>{player.pseudo}</td>
              <td>{player.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RankingTable;