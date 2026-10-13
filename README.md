# Codex Desktop Linux (Unofficial)

[![CI & Release](https://github.com/example/codex-desktop-linux/actions/workflows/ci.yml/badge.svg)](https://github.com/example/codex-desktop-linux/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Target: Ubuntu 24.04 LTS](https://img.shields.io/badge/Ubuntu-24.04%20LTS-orange.svg)](https://ubuntu.com)

Application de bureau native pour Linux (optimisée pour **Ubuntu 24.04 LTS** et distributions compatibles) permettant d'interagir graphiquement avec **Codex** via son protocole officiel **`Codex app-server`** (JSON-RPC 2.0).

---

## 🚀 Fonctionnalités Clés

1. **Serveur Codex en Arrière-Plan** :
   - Détection automatique du binaire `codex` dans votre environnement (`PATH`, `~/.local/bin`, `~/.cargo/bin`, `nvm`, `/usr/local/bin`).
   - Supervision automatique du cycle de vie du processus `codex app-server --listen stdio://`.
   - Indicateur de statut en direct dans la barre de titre (*Connecté*, *Démarrage*, *Erreur*, *Mode Simulation*).
   - Mode Mock/Simulation intégré pour tester l'application sans compte OpenAI ou hors-ligne.

2. **Gestion Complète des Conversations** :
   - **Liste des chats** dans le panneau latéral avec aperçu du modèle, date et filtre de recherche instantané.
   - Bouton **« Nouveau chat »** pour initialiser de nouvelles sessions (`thread/start`).
   - **Reprise des conversations** (`thread/resume`) avec rechargement instantané de l'historique des échanges depuis le cache local SQLite (`~/.local/share/codex-desktop/`).
   - Suppression sécurisée des conversations.

3. **Échanges et Streaming en Temps Réel** :
   - Saisie multi-lignes avec raccourci pratique (**Entrée** pour envoyer, **Maj+Entrée** pour un saut de ligne).
   - Affichage en flux continu des réponses de l'agent via les deltas JSON-RPC (`item/agentMessage/delta`).
   - Bouton d'interruption pour arrêter une génération en cours (`turn/interrupt`).
   - Bulles de messages distinctes pour l'utilisateur et l'assistant avec support de thèmes sombres/clairs.

4. **Sécurité et Contrôle** :
   - Boîte de dialogue d'approbation interactive lorsque Codex sollicite l'autorisation d'exécuter des commandes système ou de modifier des fichiers (`item/commandExecution/requestApproval`).
   - Sélecteur de modèle (`gpt-5.1-codex`, `gpt-6.1-sol`, `gpt-5-mini`).

---

## 📋 Prérequis Système

### Système d'exploitation
- **Ubuntu 24.04 LTS (Noble Numbat)** ou toute distribution Linux moderne (Debian 12+, Fedora, Arch Linux).
- Environnement de bureau compatible X11 ou Wayland (GNOME, KDE, XFCE, etc.).

### Dépendances Logicielles Linux
Installez les paquets système requis pour GTK 3 et Python :
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-gi gir1.2-gtk-3.0
```

### CLI Codex & Authentification OpenAI
Codex Desktop supervise la commande officielle `codex app-server`. Pour l'installer et vous connecter :
```bash
# 1. Installer le CLI Codex officiel (nécessite Node.js 18+)
npm install -g @openai/codex

# 2. Authentifiez-vous avec votre compte ChatGPT / OpenAI
codex login
# Ou exportez votre clé d'API si vous préférez :
# export OPENAI_API_KEY="sk-..."
```

*(Note : Si le binaire `codex` n'est pas encore installé sur votre machine, l'application démarre automatiquement en mode Mock/Simulation pour vous permettre de la tester immédiatement).*

---

## 📦 Installation sur Ubuntu 24.04

### Méthode 1 : Paquet Debian `.deb` (Recommandé)

Téléchargez le paquet `codex-desktop_1.0.0_all.deb` depuis les [Releases GitHub](../../releases) ou compilez-le localement, puis installez-le :
```bash
sudo dpkg -i dist/codex-desktop_1.0.0_all.deb
# Si des dépendances sont manquantes :
sudo apt-get install -f -y
```

Lancez l'application depuis votre menu d'applications GNOME ou via le terminal :
```bash
codex-desktop
```

### Méthode 2 : Exécution directe depuis les sources

```bash
# Cloner le dépôt
git clone https://github.com/VOTRE_UTILISATEUR/codex-desktop-linux.git
cd codex-desktop-linux

# Lancer directement l'application
./bin/codex-desktop
```

Options disponibles en ligne de commande :
- `./bin/codex-desktop --mock` : Force l'utilisation du serveur de simulation local.
- `./bin/codex-desktop --debug` : Affiche les messages JSON-RPC et les traces détaillées.
- `./bin/codex-desktop --codex-bin /chemin/vers/codex` : Définit un binaire spécifique.

---

## 🛠️ Architecture Technique

```
┌────────────────────────────────────────────────────────┐
│               Codex Desktop (Interface GTK 3)         │
│  - ui.py (Filtre, Liste, Bulles, Streaming)           │
│  - storage.py (SQLite persistance threads/messages)   │
└───────────────────────────┬────────────────────────────┘
                            │ Appels méthodes / Callbacks
┌───────────────────────────▼────────────────────────────┐
│                    ProcessManager                      │
│   Supervise le processus enfant & capture stderr       │
└───────────────────────────┬────────────────────────────┘
                            │ stdin / stdout (JSONL)
┌───────────────────────────▼────────────────────────────┐
│              CodexClient (JSON-RPC 2.0)                │
│  - initialize / initialized                           │
│  - thread/start, thread/resume, thread/list            │
│  - turn/start, turn/interrupt                         │
│  - notifications: item/agentMessage/delta             │
│  - requêtes serveur: item/.../requestApproval          │
└───────────────────────────┬────────────────────────────┘
                            │ Pipe stdio
┌───────────────────────────▼────────────────────────────┐
│      Processus Arrière-Plan : `codex app-server`       │
│         (ou MockCodexAppServer en mode hors-ligne)     │
└────────────────────────────────────────────────────────┘
```

---

## 🧪 Tests & Intégration Continue (CI)

Le projet dispose d'une suite de tests complète couvrant :
- Le protocole JSON-RPC 2.0 (framing, requête/réponse, gestion d'erreurs, requêtes d'approbation).
- La persistance SQLite (threads, messages, reprises).
- La supervision du cycle de vie du processus en arrière-plan.
- L'intégration de bout en bout avec échange de messages réels et streaming de deltas.

Pour lancer les tests localement :
```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

### GitHub Actions CI/CD (`.github/workflows/ci.yml`)
Le workflow GitHub CI s'exécute automatiquement sur **Ubuntu 24.04** :
1. Installe les dépendances système GTK 3 et Xvfb.
2. Exécute l'intégralité de la suite de tests.
3. Construit le paquet Debian `.deb` avec `./build_deb.sh`.
4. Vérifie l'intégrité et l'installation du paquet via `dpkg -i`.
5. Lors d'un push de tag (ex: `git tag v1.0.0`), publie automatiquement la **GitHub Release** avec le paquet `.deb` et l'archive `.tar.gz`.

---

## 📤 Comment pousser vers GitHub et publier la Release

Une archive complète prête à être poussée vous est fournie : `codex-desktop-linux.tar.gz`.

Voici les instructions pour la publier sur votre dépôt GitHub :

1. **Créer un nouveau dépôt sur GitHub** (par exemple nommé `codex-desktop-linux`).
2. **Initialiser et pousser votre code** :
   ```bash
   tar -xzvf codex-desktop-linux.tar.gz
   cd codex-desktop-linux
   
   # Définir l'URL de votre dépôt distant GitHub
   git remote add origin https://github.com/VOTRE_UTILISATEUR/codex-desktop-linux.git
   git branch -M main
   git push -u origin main
   ```
3. **Créer et pousser le tag de Release** :
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. **Publication automatique** : Dès la réception du tag `v1.0.0`, l'Action GitHub `.github/workflows/ci.yml` compile le paquet Debian, vérifie les tests et publie la release GitHub avec le binaire `.deb` et l'archive téléchargeable attachés !

---

## 🔍 Rapport de Vérification sur Linux

| Composant / Fonctionnalité | Statut de Vérification sur Linux |
| :--- | :--- |
| **Parsing & Protocole JSON-RPC 2.0** | ✅ **Vérifié** via suite de tests unitaires dédiés |
| **Gestion du Processus Arrière-Plan** | ✅ **Vérifié** (démarrage, supervision, arrêt propre) |
| **Streaming des Réponses (`delta`)** | ✅ **Vérifié** (réception et concaténation temps réel) |
| **Persistance & Reprise des Chats** | ✅ **Vérifié** (SQLite, CRUD threads et messages) |
| **Approbations de Commandes** | ✅ **Vérifié** (réponse `accept`/`decline` au serveur) |
| **Construction du Paquet `.deb`** | ✅ **Vérifié** (`dpkg-deb`, arborescence XDG, métadonnées) |
| **Workflow CI GitHub Actions** | ✅ **Vérifié** (syntaxe YAML conforme actions/checkout@v4, setup-python@v5) |
| **Interface Graphique GTK 3** | ✅ **Vérifié** (import PyGObject & initialisation GTK 3) |
| **Connexion directe aux serveurs OpenAI** | ⚠️ **Non vérifiable dans le sandbox** : Le bac à sable d'exécution est isolé du réseau Internet externe. La communication a été validée via le simulateur de protocole `MockCodexAppServer`. |
| **Publication en ligne sur GitHub** | ⚠️ **Non vérifiable dans le sandbox** : Nécessite vos identifiants GitHub et l'URL de votre dépôt personnel. L'archive et le workflow CI automatique sont prêts pour publication immédiate. |

---

## 📄 Licence

Ce projet est sous licence libre **MIT**. Consultez le fichier [LICENSE](LICENSE) pour plus de détails.
