import { 
  CalendarIcon, 
  StarIcon, 
  ExclamationTriangleIcon, 
  MagicWandIcon,
  Component1Icon
} from '@radix-ui/react-icons';
import './Changelog.css';

function Changelog() {
  // Données du changelog - vous pouvez les externaliser dans un fichier JSON plus tard
  const changelogEntries = [
    {
      version: "2.3.1",
      date: "2025-11-12",
      type: "patch",
      title: "Amélioration stabilité et expérience mobile",
      changes: [
        {
          type: "feature",
          text: "Admin : Persistance des salles en base de données en cas de crash serveur"
        },
        {
          type: "improvement",
          text: "Client : Buzzer plus sensitif sur mobile, correction rendu visuel"
        },
        {
          type: "improvement",
          text: "Admin : Amélioration de l'affichage sur Tablette Galaxy Tab S7 FE"
        },
        {
          type: "improvement",
          text: "Admin : Amélioration tableau d'analyse sur l'état des buzzs"
        },
        {
          type: "fix",
          text: "Admin : L'admin récupère correctement le dernier buzz en cas de reconnexion dans une salle en cours"
        },
        {
          type: "fix",
          text: "Classement : Correction d'un bug d'affichage du nombre d'entrées dans le classement"
        }
      ]
    },
    {
      version: "2.3.0",
      date: "2025-11-10",
      type: "minor",
      title: "Buzzers plus précis et mode spectateur amélioré",
      changes: [
        {
          type: "feature",
          text: "Affichage d'un compte à rebours de 5 secondes avant chaque changement de musique"
        },
        {
          type: "feature",
          text: "Admin : Nouvelle page d'analytiques détaillées pour suivre l'activité des salles"
        },
        {
          type: "improvement",
          text: "Client : Amélioration majeure de la précision des buzzers grâce à la synchronisation temporelle serveur"
        },
        {
          type: "improvement",
          text: "Client : Optimisation de la compatibilité avec React 19.2 pour de meilleures performances"
        },
        {
          type: "improvement",
          text: "Spectateur : Ajout du QR Code WiFi dans la modale (à côté du QR Code de la salle)"
        },
        {
          type: "improvement",
          text: "Spectateur : Agrandissement de la modale des QR Codes (+20%) pour une meilleure visibilité"
        },
        {
          type: "improvement",
          text: "Spectateur : Le code de la salle est maintenant beaucoup plus visible et lisible"
        },
        {
          type: "improvement",
          text: "Spectateur : Ajout du nom de la playlist Spotify en cours dans l'affichage"
        },
        {
          type: "fix",
          text: "Spectateur : Les titres et artistes trop longs ne déforment plus l'affichage Spotify"
        },
      ]
    },
    {
      version: "2.2.5",
      date: "2025-08-07",
      type: "patch",
      title: "Correction problème pseudo",
      changes: [
        {
          type: "fix",
          text: "Correction qui empêchait les joueurs d'utiliser un pseudo contenant le caractère '&'"
        }
      ]
    },
    {
      version: "2.2.4",
      date: "2025-08-05",
      type: "patch",
      title: "Correction gestion Spotify",
      changes: [
        {
          type: "fix",
          text: "Admin : Correction du rafraichissement du jeton Spotify pour éviter les erreurs de connexion passé 1h de jeu"
        }
      ]
    },
    {
      version: "2.2.3",
      date: "2025-07-12",
      type: "patch",
      title: "Corrections gestion pause côté Admin",
      changes: [
        {
          type: "fix",
          text: "Admin : Correction de la possibilité de mettre en pause ou de reprendre la partie depuis le panel d'administration"
        }
      ]
    },
    {
      version: "2.2.2",
      date: "2025-07-05",
      type: "patch",
      title: "Corrections gestion buzz côté Admin",
      changes: [
        {
          type: "fix",
          text: "Admin : Correction de l'affichage des buzzers dans le panel d'administration"
        }
      ]
    },
    {
      version: "2.2.1",
      date: "2025-06-29",
      type: "patch",
      title: "Corrections désynchronisation et antispam client",
      changes: [
        {
          type: "improvement",
          text: "Amélioration de l'antispam client pour éviter les buzzs multiples en cas de latence réseau"
        },
        {
          type: "improvement",
          text: "Spectateur : Agrandissement des textes de l'affichage Spotify pour une meilleure lisibilité"
        },
        {
          type: "fix",
          text: "Correction de la gestion des tokens Spotify pour éviter les erreurs de connexion"
        },
        {
          type: "fix",
          text: "Admin : Correction des problèmes de désynchronisation lors d'un spam de buzzs client"
        },
        {
          type: "fix",
          text: "Spectateur : Correction de l'affichage Spotify et des scores dans le mode spectateur"
        }
      ]
    },
    {
      version: "2.2.0",
      date: "2025-06-24",
      type: "minor",
      title: "Ajout du mode spectateur",
      changes: [
        {
          type: "feature",
          text: "Ajout du mode spectateur pour suivre les parties en temps réel (à condition d'avoir le code 😏)"
        },
        {
          type: "improvement",
          text: "Spectateur : Le bouton 'spectateur' permet d'afficher le QR code du RDV-Buzzer"
        },
        {
          type: "improvement",
          text: "Spectateur : L'oeil permet de cacher le code de la salle"
        },
        {
          type: "improvement",
          text: "Le mode spectateur s'affiche à condition d'entrer un code de salle valide"
        },
        {
          type: "fix",
          text: "L'interface indique si le code de la salle est invalide"
        }
      ]
    },
    {
      version: "2.1.0",
      date: "2025-06-22",
      type: "minor",
      title: "Ajout spotify, amélioration des buzzers et correctifs mineurs",
      changes: [
        {
          type: "feature",
          text: "Ajout du nombre de musiques restantes dans la salle (Spotify)"
        },
        {
          type: "feature",
          text: "Ajout de la page Nouveautés dans le menu"
        },
        {
          type: "improvement",
          text: "Amélioration majeure de la gestion des buzzers (compensation des latences réseau)"
        },
        {
          type: "fix",
          text: "Correction de la mise en veille automatique de l'écran (Android et iOS)"
        },
        {
          type: "fix",
          text: "Amélioration de la gestion des déconnexions clients avec reconnexion automatique (problème réseau)"
        },
        {
          type: "fix",
          text: "Admin: Découplage de l'intégration Spotify pour permettre à une salle sans intégration de fonctionner correctement"
        },
        {
          type: "fix",
          text: "Empêcher le navigateur de traduire les textes de l'interface utilisateur"
        }
      ]
    },
    {
      version: "2.0.1",
      date: "2025-04-16",
      type: "minor",
      title: "Nouvelles options de salle et corrections de bugs",
      changes: [
        {
          type: "feature",
          text: "Permettre de générer des salles Standard ou Titre/Artiste"
        },
        {
          type: "feature",
          text: "Afficher le titre et l'artiste de la musique en cours (Spotify)"
        },
        {
          type: "fix",
          text: "Corrections de bugs mineurs dans l'interface utilisateur"
        }
      ]
    },
    {
      version: "2.0.0",
      date: "2025-03-19",
      type: "major",
      title: "Version majeure - Nouvelle interface et fonctionnalités",
      changes: [
        {
          type: "feature",
          text: "Intégration complète Spotify avec pause automatique"
        },
        {
          type: "feature",
          text: "Eviter la mise en veille automatique de l'écran pendant les parties"
        },
        {
          type: "improvement",
          text: "Meilleur affichage des scores et des modales de buzz"
        }
      ]
    },
    {
      version: "1.0.0",
      date: "2025-02-26",
      type: "major",
      title: "Version majeure - Naissance du RDV-Buzzer 🍾",
      changes: [
        {
          type: "feature",
          text: "Création et gestion de salles avec codes"
        },
        {
          type: "feature",
          text: "Système de buzzers pour les joueurs en temps réel"
        },
        {
          type: "feature",
          text: "Suivi des scores et classement des joueurs"
        },
        {
          type: "feature",
          text: "Intégration Spotify pour mettre en pause automatiquement la musique lors d'un buzzer"
        },
        {
          type: "feature",
          text: "Thème sombre et clair pour l'interface"
        },
        {
          type: "feature",
          text: "Panel d'administration pour gérer les salles et les joueurs"
        },
      ]
    }
  ];

  const getVersionTypeClass = (type) => {
    switch (type) {
      case 'major': return 'version-major';
      case 'minor': return 'version-minor';
      case 'patch': return 'version-patch';
      default: return 'version-patch';
    }
  };

  const getChangeIcon = (type) => {
    switch (type) {
      case 'feature': return <StarIcon className="change-icon feature" />;
      case 'fix': return <ExclamationTriangleIcon className="change-icon fix" />;
      case 'improvement': return <MagicWandIcon className="change-icon improvement" />;
      default: return <MagicWandIcon className="change-icon" />;
    }
  };

  const getChangeTypeClass = (type) => {
    switch (type) {
      case 'feature': return 'change-feature';
      case 'fix': return 'change-fix';
      case 'improvement': return 'change-improvement';
      default: return 'change-improvement';
    }
  };

  return (
    <div className="changelog-container">
      <div className="changelog-header">
        <h1 className="changelog-title">
          <Component1Icon className="title-icon" />
          Nouveautés
        </h1>
        <p className="changelog-subtitle">
          Découvrez les dernières améliorations et fonctionnalités ajoutées au RDV-Buzzer
        </p>
      </div>

      <div className="changelog-content">
        {changelogEntries.map((entry, index) => (
          <div key={index} className="changelog-entry">
            <div className="entry-header">
              <div className="version-info">
                <span className={`version-badge ${getVersionTypeClass(entry.type)}`}>
                  v{entry.version}
                </span>
                <div className="entry-meta">
                  <CalendarIcon className="date-icon" />
                  <span className="entry-date">
                    {new Date(entry.date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
              <h2 className="entry-title">{entry.title}</h2>
            </div>

            <div className="changes-list">
              {entry.changes.map((change, changeIndex) => (
                <div key={changeIndex} className={`change-item ${getChangeTypeClass(change.type)}`}>
                  {getChangeIcon(change.type)}
                  <span className="change-text">{change.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="changelog-footer">
        <div className="legend">
          <h3>Légende</h3>
          <div className="legend-items">
            <div className="legend-item">
              <StarIcon className="change-icon feature" />
              <span>Nouvelle fonctionnalité</span>
            </div>
            <div className="legend-item">
              <MagicWandIcon className="change-icon improvement" />
              <span>Amélioration</span>
            </div>
            <div className="legend-item">
              <ExclamationTriangleIcon className="change-icon fix" />
              <span>Correction de bug</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Changelog;