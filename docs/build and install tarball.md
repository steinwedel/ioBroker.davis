# 1. Paket bauen
cd ~/Programming/ioBroker.adapter/ioBroker.davis
npm pack
# Erzeugt: iobroker.davis-<version>.tgz (Versionsnummer aus package.json)

# 2. Auf Zielserver kopieren
scp iobroker.davis-<version>.tgz user@zielserver:/tmp/

# 3. Auf Zielserver installieren
ssh user@zielserver
cd /opt/iobroker
npm install /tmp/iobroker.davis-<version>.tgz
iobroker upload davis

# 4. Instanz neu starten, damit der neue Code geladen wird
iobroker restart davis.0

---

# Automatisiert: ../scripts/deploy.sh

Der obige Ablauf (build → pack → scp → install → upload → restart → Version
verifizieren) ist in `../scripts/deploy.sh` automatisiert. Voraussetzung ist die
`.env` in der Sammlungswurzel (`../.env`) mit `SERVER_HOST`, `SERVER_USER`,
`SERVER_PORT` und entweder `SERVER_SSH_KEY_PATH` oder `SERVER_PASSWORD`.
Siehe `../AGENTS.md`.

```bash
../scripts/deploy.sh
```

`../scripts/build.sh` kombiniert zusätzlich einen Versions-Release
(`npm run release patch|minor|major`, siehe Abschnitt "Versionierung /
Release" unten) mit dem anschließenden Deploy:

```bash
../scripts/build.sh patch          # Release (patch) + Deploy
../scripts/build.sh --dry-run      # Nur simulieren, nichts committen/pushen/deployen
../scripts/build.sh --no-deploy minor   # Release (minor), aber ohne Deploy
```

---

# Update (bereits installierter Adapter)

Der Ablauf ist identisch zur Erstinstallation — `npm pack` + `scp` + `npm install` überschreiben die vorhandene Version automatisch. Wichtig ist nur, danach `iobroker upload` und einen Neustart der Instanz auszuführen, sonst läuft der alte Code im Speicher weiter.

## Lokal (Version bauen)
```bash
cd ~/Programming/ioBroker.adapter/ioBroker.davis
npm run build          # kompiliert TypeScript -> build/
npm pack                # erzeugt iobroker.davis-<version>.tgz mit der aktuellen package.json-Version
```

## Auf dem Zielserver
```bash
scp iobroker.davis-<version>.tgz user@zielserver:/tmp/

ssh user@zielserver
cd /opt/iobroker

# Installiert/überschreibt die Adapter-Dateien in node_modules/iobroker.davis
# Falls /opt/iobroker dem Benutzer "iobroker" gehört (Standard bei den meisten
# Installationen) und man sich mit einem anderen Benutzer eingeloggt hat, schlägt
# ein normales "npm install" mit EACCES fehl - dann als iobroker-User ausführen:
sudo -u iobroker npm install /tmp/iobroker.davis-<version>.tgz

# Synchronisiert io-package.json-Änderungen (neue States, admin/jsonConfig.json etc.)
# in die Objekt-Datenbank
sudo -u iobroker ./iobroker upload davis

# Adapter-Instanz neu starten, damit der aktualisierte Code tatsächlich läuft
sudo -u iobroker ./iobroker restart davis.0
```

## Hinweise
- **`npm install` alleine reicht nicht** — `iobroker upload` muss danach laufen, damit z.B. neue/geänderte States aus `io-package.json` und die Admin-UI (`admin/jsonConfig.json`) übernommen werden.
- **`iobroker restart davis.0` ist notwendig**, weil der laufende Node-Prozess der Instanz sonst weiterhin den alten (bereits geladenen) Code im Speicher ausführt, selbst wenn die Dateien auf der Platte bereits aktualisiert sind.
- Alternativ zum manuellen Neustart: `iobroker upload davis` löst je nach ioBroker-Version bereits selbst einen Neustart der laufenden Instanz(en) aus — im Zweifel trotzdem `iobroker restart davis.0` ausführen, um sicherzugehen.
- Die Versionsnummer im Tarball-Dateinamen (`iobroker.davis-<version>.tgz`) entspricht immer dem Wert aus `package.json` zum Zeitpunkt von `npm pack` — bei jedem Update ändert sich der Dateiname entsprechend.
- Alte Tarball-Dateien auf dem Zielserver (`/tmp/*.tgz`) können nach erfolgreichem Update gelöscht werden, sie werden nicht automatisch benötigt.
- Falls sich am nativen Config-Schema (`io-package.json` → `native`) etwas geändert hat, prüft `iobroker upload` dies nicht automatisch nach — ggf. die Instanz-Konfiguration im Admin öffnen und speichern, damit fehlende Felder mit Defaults aufgefüllt werden.
- **Häufigste Ursache für "Version aktualisiert sich nicht"**: Es wurde versehentlich dasselbe (alte) Tarball erneut hochgeladen/installiert, statt vorher `npm run build && npm pack` erneut auszuführen. Der Dateiname im Tarball MUSS die neue Zielversion tragen (`iobroker.davis-<neue-version>.tgz`) — mit `ls -la /tmp/*.tgz` auf dem Server und `grep version node_modules/iobroker.davis/package.json` vor und nach der Installation prüfen.

---

# Versionierung / Release

Die Versionsnummer wird **nicht manuell** in `package.json`/`io-package.json`
gepflegt, sondern über [`@alcalzone/release-script`](https://github.com/AlCalzone/release-script)
verwaltet (Konfiguration in `.releaseconfig.json`, Skript `npm run release`).

```bash
npm run release patch   # Bugfixes: 0.1.2 -> 0.1.3
npm run release minor   # neue Features: 0.1.x -> 0.2.0
npm run release major   # Breaking Changes: 0.x -> 1.0.0
npm run release patch -- --dry-run   # nur simulieren, nichts ändern/committen/pushen
```

Der Release-Vorgang:
1. Führt `npm run build` aus (`.releaseconfig.json` → `exec.before_commit`).
2. Aktualisiert die Version in `package.json` und `io-package.json`.
3. Verschiebt den `## **WORK IN PROGRESS**`-Abschnitt in `README.md`/`CHANGELOG.md`
   in eine neue datierte Versions-Sektion.
4. Erstellt einen Git-Commit und Tag für die neue Version.
5. Pusht Commit + Tag zum Remote-Repository.

**Voraussetzung:** Vor dem Release muss unter `## **WORK IN PROGRESS**` mindestens
ein Changelog-Eintrag vorhanden sein, sonst bricht der Release-Vorgang ab.

Im Anschluss an einen Release kann `../scripts/deploy.sh` (bzw. gebündelt über
`../scripts/build.sh <bump>`) die neue Version auf den Zielserver ausrollen.
