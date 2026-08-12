# Workpackage-Ablauf: Obsidian-CLI-Tests

Stand: 2026-08-12

## Ziel

Die Obsidian-CLI wird als reproduzierbare End-to-End-Testschicht fuer das
Plugin eingefuehrt. Coding-Agenten sollen damit nach einem Build eine echte
Obsidian-Instanz bedienen, Plugin-Commands ausfuehren und Ergebnisse ueber DOM,
Konsole, JavaScript-Fehler und Screenshots pruefen koennen.

Die bestehende Jest-Suite bleibt die schnelle Testbasis. CLI-Tests pruefen nur
die Integration, die in JSDOM nicht verlaesslich abbildbar ist: Plugin-Laden,
Obsidian-Workspace, Canvas-DOM, Commands und die Kommunikation mit einem
laufenden SemaLogic-Service.

## Ist-Zustand

- `npm test` fuehrt Jest-Tests aus (`main.test.ts`, `src/rulesout.test.ts`).
  Sie testen Hilfsfunktionen und das API-00.03.00-Response-Envelope gut, aber
  keine laufende Obsidian-App.
- `Build_obsidian.ps1` baut das Plugin und kopiert es in den festen Test-Vault
  `D:\Neuorga\Programmierung\Obsidian\TestProjectVaultSL\UseSemaLogicOffTest\UseSemaLogicOffTest`.
- Das Plugin registriert bereits geeignete Test-Commands:
  `sl_create_test_canvas` und `sl_create_template_canvas`.
- Der Service wird ueber Profile konfiguriert (`myBaseURL`, `myPort`, HTTPS,
  SID). Das Repository enthaelt aber weder Service-Quellcode noch eine bekannte
  Startanweisung. Ein Test darf deshalb keinen Serverpfad oder Startbefehl
  fest einprogrammieren.

## Zielbild

```
Jest (immer, offline) --> Build --> Obsidian CLI --> Smoke/UI-Pruefungen
                                              \
                                               --> optional: lokaler Service
                                                    --> API-/Workflow-Pruefungen
```

Es gibt zwei explizite Testmodi:

| Modus | Voraussetzung | Zweck | Ausfuehrung |
| --- | --- | --- | --- |
| `smoke` | Obsidian-App, CLI, Test-Vault | Plugin laden, Commands, Canvas, DOM, Fehlerkonsole | lokal / CI mit Desktop |
| `integration` | wie `smoke` plus erreichbarer lokaler Service | Reset, API-Version, Parsing, Diagnostics, Knowledge-/Canvas-Workflow | nur opt-in |

Der Integrationstest startet den Server ueber einen konfigurierten Hook und
wartet danach aktiv auf `GET /api-version`. Ein fehlender Hook bedeutet:
Integrationstest wird eindeutig als **skipped** gemeldet, nicht stillschweigend
gegen den produktiven Standardhost ausgefuehrt.

## Konventionen fuer alle Workpackages

- Ausschliesslich der Test-Vault darf automatisiert beschrieben werden. Der
  Pfad kommt aus einer lokalen, nicht eingecheckten Konfiguration.
- Jeder Testlauf verwendet eine frische, zufaellige SID und einen eigenen
  Fixture-Ordner, damit parallele oder abgebrochene Laeufe keine Session teilen.
- Geheimnisse, Produktionsadressen und lokale Serverpfade gehoeren in
  `.env`/eine lokale Konfigurationsdatei, nie in Git oder Konsolenausgaben.
- Wartezustaende sind polling-basiert und haben ein Timeout mit Diagnose.
  Keine festen langen `Start-Sleep`-Pausen.
- Ein UI-Test gilt erst als erfolgreich, wenn `obsidian dev:errors` keine neue
  JavaScript-Exception meldet. Screenshots sind Artefakte fuer Fehleranalyse,
  nicht das alleinige Assertion-Mittel.
- Vor CLI-Tests wird das gebaute Plugin kopiert und per `obsidian reload`
  geladen. Damit ist garantiert der aktuelle Workspace-Code unter Test.
- Neue Test-IDs und DOM-Selektoren muessen stabil und bewusst als Testvertrag
  benannt sein (z. B. `data-sl-test="diagnostics"`), nicht aus CSS-Klassen
  abgeleitet werden.

## Workpackages

### WP-01: Laufzeit-Voraussetzungen und Testkonfiguration

**Ergebnis:** Ein dokumentierter Preflight und eine lokale Konfiguration fuer
CLI, Vault und Service, ohne hardcodierte benutzerspezifische Werte.

**Aufgaben:**

1. `docs/TESTING.md` mit Installation/Registrierung der Obsidian-CLI,
   erforderlicher laufender App und dem Test-Vault anlegen.
2. Vorlage `tests/obsidian/.env.example` anlegen. Mindestens:
   `OBSIDIAN_CLI`, `SL_TEST_VAULT`, `SL_SERVICE_URL`, `SL_SERVER_START_CMD`,
   `SL_SERVER_STOP_CMD` und `SL_TEST_TIMEOUT_MS`.
3. Einen PowerShell-Preflight implementieren: CLI erreichbar, App-Version,
   gewuenschtes Vault aktiv/oeffnbar, Plugin installiert, keine Produktion als
   Vault oder Serviceziel.
4. Lokale Konfiguration und Testartefakte in `.gitignore` aufnehmen.

**Akzeptanz:** `npm run test:obsidian:preflight` gibt fehlende Voraussetzungen
mit konkreter Abhilfe aus und schreibt keine Vault-Datei.

**Abhaengigkeiten:** keine.

### WP-02: Test-Runner und Artefakt-Lebenszyklus

**Ergebnis:** Ein einheitlicher Runner baut, installiert, startet, prueft und
raeumt auf.

**Aufgaben:**

1. `scripts/test-obsidian.ps1` mit Parametern `-Mode smoke|integration`,
   `-KeepArtifacts` und `-NoBuild` erstellen.
2. Ablauf: Preflight -> `npm test` -> Plugin-Build/Kopie -> Obsidian-Fenster
   reload -> alte CLI-Fehler leeren -> Test-Folder vorbereiten -> Tests ->
   Ergebnisse/Artefakte schreiben.
3. `try`/`finally` verwenden: gestarteten Service nur dann stoppen, wenn der
   Runner ihn selbst gestartet hat; temporäre Testdateien gezielt entfernen.
4. NPM-Skripte `test:obsidian:smoke` und `test:obsidian:integration` anlegen.

**Akzeptanz:** Ein Smoke-Lauf erzeugt einen Maschinen-lesbaren Ergebnisreport
und bei Fehlschlag Screenshot, DOM-Dump und CLI-Konsole unter einem ignorierten
Artefaktordner.

**Abhaengigkeiten:** WP-01.

### WP-03: Kleine Test-Schnittstelle im Plugin

**Ergebnis:** CLI-Tests koennen verlässlich auf Plugin-Zustaende warten, ohne
interne Obsidian-DOM-Strukturen zu erraten.

**Aufgaben:**

1. Fuer bestehende Canvas-Testcommands Erfolg/Fehler durch Notice und einen
   stabilen Logeintrag mit `slconsolelog` sichtbar machen.
2. In SemaLogic-, Diagnostics- und Canvas-Ansichten minimale `data-sl-test`-
   Marker an den fachlich relevanten Containern ergänzen.
3. Optional einen nur im Testmodus registrierten Command zum Zuruecksetzen der
   Testfixture bereitstellen; kein produktiver Command darf Testdaten loeschen.
4. Dazu Jest-Tests fuer neue reine Helfer und einen kurzen Testvertrag in
   `docs/TESTING.md` schreiben.

**Akzeptanz:** DOM-Abfragen funktionieren ueber dokumentierte Selektoren und
neue Diagnoseausgaben verwenden ausschliesslich `slconsolelog`.

**Abhaengigkeiten:** WP-01; kann parallel zu WP-02 beginnen.

### WP-04: Baseline-Smoke-Tests mit Obsidian CLI

**Ergebnis:** Der erste echte E2E-Testfall deckt Laden, Commands und Canvas ab.

**Testfaelle:**

1. Plugin nach `obsidian reload` ist geladen; `obsidian commands
   filter=sl_create_` listet beide Canvas-Commands.
2. `obsidian command id=sl_create_test_canvas` erstellt die erwartete Canvas-
   und Info-Datei im isolierten Testordner.
3. Die Canvas-Datei wird geoeffnet; `obsidian dev:dom` prueft Canvas und
   Tooltip-Anker/Info-Button anhand der Marker aus WP-03.
4. Der komplexe Fixture-Command erzeugt Dateien aus dem optionalen Canvas-
   `files`-Array unter `.SemaLogic/nodeinfos/` und setzt `SL_LinkedFile` sowie
   `SL_DataFile` korrekt.
5. `obsidian dev:errors` bleibt leer; bei Abweichung wird mit
   `obsidian dev:screenshot` ein Bild archiviert.

**Akzeptanz:** `npm run test:obsidian:smoke` ist auf einem vorbereiteten
Windows-Testrechner wiederholbar gruen und veraendert keine Produktiv-Vault.

**Abhaengigkeiten:** WP-02, WP-03.

### WP-05: Server-Adapter und Integrationstest-Lebenszyklus

**Ergebnis:** Der SemaLogic-Server kann vor Integrationstests explizit gestartet
und danach sauber beendet werden.

**Aufgaben:**

1. `SL_SERVER_START_CMD` als opt-in-Prozess starten; Prozess-ID und Logdatei
   im Artefaktordner sichern.
2. Falls die URL bereits erreichbar ist, keinen zweiten Server starten und dies
   im Report ausweisen.
3. Readiness pruefen: wiederholt `GET $SL_SERVICE_URL/api-version`, erwartete
   Mindestversion `00.03.00`; bei Timeout Serverlog, letzte Antwort und
   Konfiguration ohne Geheimnisse ausgeben.
4. Testprofil im Test-Vault auf die lokale URL und frische SID setzen. Vor und
   nach jedem Fall `POST /reset?sid=...` ausfuehren.
5. Stop-Hook nur fuer selbst gestartete Instanzen aufrufen; fehlende Hooks
   ergeben einen klaren Skip statt eines Remote-Fallbacks.

**Akzeptanz:** Der Runner kann einen bekannten lokalen Service starten, dessen
Bereitschaft abwarten und ihn auch bei fehlgeschlagenem Test beenden.

**Abhaengigkeiten:** WP-02. Benötigt vom Service-Repository einen konkreten
Start- und optionalen Stop-Befehl.

### WP-06: API- und Rendering-Integrationstestmatrix

**Ergebnis:** Die wichtige API-00.03.00-Integration wird gegen einen echten
Service verifiziert.

| Prioritaet | Fall | Erwartung |
| --- | --- | --- |
| P0 | API-Version + Reset | Service mindestens `00.03.00`, isolierte SID |
| P0 | SemaLogic-Parse | gerenderter Payload, keine JS-Fehler |
| P0 | fachlicher Fehler (422) | Diagnostics sichtbar, kein Crash, `rules: null` behandelt |
| P1 | SemanticTree | Voll-Dokument wird sicher eingebettet, CSS bleibt gescoped |
| P1 | SVG | SVG sichtbar und nicht als JSON-Text gerendert |
| P1 | KnowledgeGraph | Canvas wird erzeugt; `files` liegen unter `.SemaLogic/nodeinfos/` |
| P1 | Developer-Audience | verborgene technische Findings werden erst auf Aktion nachgeladen |
| P2 | Dialect v1/v2 | korrekter `DialectEngine`-Request und Diagnostics |
| P2 | AnnotatedHTML | `source=echo` und `source=annotate` unterscheiden |

Jeder Fall nutzt eine kleine eingecheckte Fixture mit stabiler fachlicher
Erwartung. Grosse reale BAfoeG-Dokumente bleiben manuelle Regressionstests,
bis sie auf minimale, deterministische Teilfaelle reduziert sind.

**Akzeptanz:** P0-Faelle laufen in `integration` automatisch; P1/P2 werden
schrittweise als einzelne, eindeutig benannte Testdateien hinzugefuegt.

**Abhaengigkeiten:** WP-04, WP-05.

### WP-07: Canvas-Interaktion und visuelle Regression

**Ergebnis:** Die derzeit risikoreichste UI (MutationObserver, Tooltip,
Info-Button, Menu-Anker) ist automatisiert abgesichert.

**Aufgaben:**

1. Nach Canvas-DOM-Neuaufbau pruefen, dass Hover-Tooltip erneut gebunden ist.
2. Verifizieren: Hover nutzt `SL_LinkedFile`; `ⓘ` bevorzugt `SL_DataFile`.
3. Schliessen durch zweiten Klick, Outside-Click, Escape und Scroll testen.
4. Auswahl-, Insert-, Change- und Relationstyp-Controls mit stabilen DOM-
   Assertions pruefen.
5. Nur fuer ausgereifte Screens eine Screenshot-Baseline einführen; tolerante
   Bilddifferenz und nachvollziehbarer Update-Prozess sind Pflicht.

**Akzeptanz:** Alle in `AGENTS.md` genannten Tooltip-Verhaltensweisen sind
reproduzierbar testbar; flüchtige Pixelunterschiede erzeugen keine Fehlalarme.

**Abhaengigkeiten:** WP-03, WP-04.

### WP-08: CI-Strategie und Agenten-Übergabe

**Ergebnis:** Tests sind fuer Coding-Agenten und CI eindeutig steuerbar.

**Aufgaben:**

1. PR-Gate: TypeScript-Build und Jest immer ausfuehren.
2. Desktop-Runner: Smoke bei Bedarf/nightly; Integration nur mit lokalem
   Service-Container oder explizitem Runner-Label.
3. README-Testtabelle pflegen: Testname, Modus, Fixture, Prüfpunkte,
   Fehlerartefakte.
4. Ein Agenten-Template anlegen: Ziel, erlaubte Dateien, Befehl, Akzeptanz,
   bekannte Grenzen. Pro Agent nur ein Workpackage oder Teilfall.

**Akzeptanz:** Ein Agent kann WP-04 oder einen einzelnen WP-06-Fall ohne
implizites Wissen um lokale Pfade, Zugangsdaten oder manuelle Schritte umsetzen.

**Abhaengigkeiten:** WP-04 bis WP-07 nach Bedarf.

## Empfohlene Reihenfolge

1. WP-01 und WP-02: sichere, wiederholbare Infrastruktur.
2. WP-03: kleine Testverträge im Plugin.
3. WP-04: erster belastbarer CLI-Smoke-Test.
4. WP-05: Service als expliziter Lifecycle-Hook.
5. WP-06: zuerst P0, dann P1/P2.
6. WP-07 und WP-08: UI-Abdeckung und Automatisierung ausbauen.

## Offene Entscheidung vor WP-05

Benötigt wird nur eine Information aus dem SemaLogic-Service-Repository:
Welcher lokale Startbefehl (inklusive Arbeitsverzeichnis, Port und optionalem
Stopbefehl) soll für Tests verwendet werden? Bis dahin sind WP-01 bis WP-04
vollständig unabhängig umsetzbar.

## Quellen

Die Obsidian-CLI setzt einen laufenden Obsidian-Desktop voraus und stellt die
benötigten Entwicklerbefehle `reload`, `command`, `dev:errors`, `dev:dom`,
`dev:console`, `dev:screenshot` und `eval` bereit. Siehe die offizielle
[Obsidian-CLI-Dokumentation](https://obsidian.md/help/cli).
