import React from 'react';

/**
 * Composant réutilisable pour afficher une liste de joueurs filtrée
 * @param {object} players - Objet contenant les joueurs
 * @param {function} renderItem - Fonction de rendu pour chaque joueur
 * @param {string} className - Classes CSS additionnelles pour la liste
 */
const FilteredPlayerList = ({ players, renderItem, className = "" }) => {
  return (
    <ul className={`list-group ${className}`}>
      {Object.entries(players)
        .filter(([playerId, player]) => !player.isAdmin)
        .map(([playerId, player]) => renderItem(playerId, player))}
    </ul>
  );
};

export default FilteredPlayerList;