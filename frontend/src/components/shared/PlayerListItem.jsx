import React from 'react';

/**
 * Composant réutilisable pour afficher un élément de liste de joueur
 * @param {string} playerId - ID du joueur
 * @param {object} player - Données du joueur
 * @param {ReactNode} children - Contenu à afficher à droite de l'élément (boutons, inputs, etc.)
 * @param {string} additionalInfo - Information supplémentaire à afficher après le pseudo (ex: score)
 */
const PlayerListItem = ({ playerId, player, children, additionalInfo = null }) => {
  return (
    <li
      key={playerId}
      className="list-group-item d-flex justify-content-between align-items-center"
    >
      <span>
        {player.pseudo}
        {additionalInfo && <> : {additionalInfo}</>}
      </span>
      {children}
    </li>
  );
};

export default PlayerListItem;