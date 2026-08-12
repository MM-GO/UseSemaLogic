# Obsidian CLI: Interaktions- und Integrationstestfaelle

Diese Testfaelle erweitern den Basis-Smoke-Test. Jeder Fall wird mit der
Obsidian-CLI ausgefuehrt und nutzt stabile `data-sl-test`-Marker statt
Obsidian-interner DOM-Strukturen.

## Ausfuehrungsregeln

- **UI**: `obsidian dev:dom` prueft Zustand und Inhalt; `obsidian eval` darf
  ausschliesslich einen dokumentierten Klick, eine Auswahl oder ein DOM-Event
  ausloesen. Der Erfolg wird danach wieder ueber DOM, Vault-Datei oder Konsole
  validiert.
- **Requests**: Integrationstests starten den lokalen Service zuerst (WP-05),
  leeren danach `dev:errors` und `dev:console`, und pruefen sowohl die sichtbare
  Antwort als auch den erwarteten Request-Logeintrag. Jeder Testfall hat eine
  eigene SID und endet mit `/reset`.
- **Artefakte**: Bei Fehler Screenshot, DOM-Dump, Obsidian-Konsole,
  JavaScript-Fehler und Serverlog speichern. Screenshots sind Zusatzdiagnose,
  keine alleinige Assertion.
- **Kein Remote-Fallback**: Ist der lokale Service nicht bereit, wird ein
  Integrationstest `skipped`; er darf nie die Standard-Service-URL benutzen.

## P0: Bedienung ohne Server

| ID | Aktion | CLI-Ausfuehrung | Erwartung |
| --- | --- | --- | --- |
| UI-01 | SemaLogic-View laden | Plugin laden, dann `dev:dom selector=[data-sl-test="semalogic-view"] total` | genau eine View-Wurzel; keine neuen JS-Fehler |
| UI-02 | Ausgabedropdown | Per `eval` `select.value=...; dispatchEvent(new Event('change',{bubbles:true}))` | Marker `[data-sl-test="output-format"]` hat den neuen Wert; KnowledgeGraph oeffnet den Knowledge-Canvas |
| UI-03 | Darstellungsmodus | Per `eval` auf `[data-sl-test="result-mode-toggle"]` klicken | Schaltertext und Klasse `is-source` wechseln; nach Reload bleibt die Wahl erhalten |
| UI-04 | Diagnostics-Buttons | Per `eval` Defects/Warnings/Developer klicken | `is-off` und Sichtbarkeit der zugehoerigen Sektion wechseln; ohne letzte Anfrage wird kein Request ausgelöst |
| UI-05 | Canvas-Fixtures | `command id=sl_create_test_canvas` und `sl_create_template_canvas` | Canvas und alle referenzierten Info-/Data-Dateien liegen im Test-Vault; die Canvas bleibt dabei geschlossen |
| UI-06 | Canvas-Initialisierung | Fixture öffnen, dann DOM pollen | `[data-sl-test="canvas"]`, Info-Button und mindestens ein `[data-sl-test-tooltip-bound="1"]` erscheinen |
| UI-07 | Canvas-Tooltip | Pointer-Enter auf einen gebundenen Knoten mit `eval` auslösen | Tooltip hat `[data-sl-test="canvas-tooltip"]`; sein Inhalt stammt aus `SL_LinkedFile` |
| UI-08 | Canvas-Info | Knoten fokussieren, Info-Button klicken | Tooltip benutzt bevorzugt `SL_DataFile`; zweiter Klick, Outside-Click, Escape und Scroll schließen ihn |

## P0: Servergestuetzte Abläufe

| ID | Aktion | Request-Pruefung | Sichtbare Erwartung |
| --- | --- | --- | --- |
| API-01 | View öffnen | `GET /api-version`, `POST /reset?sid=...` | SemaLogic-View aktiv; Mindestversion 00.03.00 |
| API-02 | SemaLogic-Dropdown | `POST /rules/parse?sid=...` mit `rulesettype=SemaLogic` | HTML-Fragment unter `[data-sl-test="result"]`; Diagnostics-Summary sichtbar |
| API-03 | SVG-Dropdown | Parse mit `rulesettype=SVG` | SVG wird gerendert, nicht als JSON-Text angezeigt; Zoom-Controls erscheinen |
| API-04 | SemanticTree-Dropdown | Parse mit `rulesettype=SemanticTree` | Voll-Dokument ist sicher eingebettet; eigenes CSS bleibt im Scope |
| API-05 | KnowledgeGraph-Dropdown | Parse mit `rulesettype=KnowledgeGraph` | Canvas und optionale `files` unter `.SemaLogic/nodeinfos/` vorhanden |
| API-06 | Fehlerantwort | gezielte 422-Fixture | Diagnostics und Fehlerbereich sichtbar, Anwendung bleibt bedienbar |
| API-07 | Developer-Button | erneuter Parse mit `audience=developer` | versteckte technische Findings erscheinen erst nach Klick; keine Anfrage vor dem Klick |
| API-08 | DialectEngine | `engine=dialectgen_v1` bzw. `dialectgen_v2` und `rulesettype=DialectEngine` | Fortschrittsanzeige endet, Ergebnis/Diagnostics erscheinen, automatische Folgeanfrage bleibt aus |

## P1: Annotationen, Navigation und Inhalt

| ID | Aktion | Erwartung |
| --- | --- | --- |
| NAV-01 | HTML-Link innerhalb eines SemaLogic-Ergebnisses anklicken (`.lawlink > a[href^='#']`) | Ziel mit passender ID wird zentriert; keine Navigation zu einer Datei/URL |
| NAV-02 | Fehlendes oder URL-kodiertes Ziel | kodiertes Ziel wird aufgelöst; fehlendes Ziel produziert eine Error-Logzeile, aber keinen JS-Fehler |
| NAV-03 | `data-sl-interpreter`-Annotation anklicken | richtiger SL64-/`data-sl-text`-Inhalt wird an den Interpreter übergeben; Auswahl wird nicht ungewollt ersetzt |
| NAV-04 | Annotation mit `data-sl-ref` ohne `data-sl-text` | Fallback auf Referenz funktioniert |
| NAV-05 | AnnotatedHTML | `source=echo` zeigt den bekannten Hinweis; `source=annotate` rendert Annotationen als Markup |
| NAV-06 | Editor-zu-Link Navigation | Link in Live Preview springt zum passenden Quell-Element und erhält `:target`-Stil |

## Weitere lohnende Regressionen (P2)

- Debouncing: Mehrere schnelle Editoränderungen erzeugen nur die letzte
  relevante Parse-Anfrage.
- Request-Sperre: Ein zweiter Interpreter-Klick startet keine parallele
  Anfrage.
- Fehlerresistenz: Netzwerkfehler, ungültiges Canvas-JSON und leere Antworten
  liefern nutzbare Fehlermeldungen und keine unbehandelte Exception.
- Persistenz: Profil, Ausgabeformat, Diagnostics-Toggles und Source-Modus
  bleiben nach Plugin-Reload erhalten.
- Accessibility: Buttons haben Namen, Dropdown ist mit Tastatur bedienbar,
  Tooltip schließt mit Escape.
- Sicherheitsregression: Voll-Dokumente enthalten keine aktiven `script`-
  oder externen `link`-Elemente im Resultat.
- Parallelität: Zwei Läufe mit unterschiedlichen SIDs teilen weder
  Service-Session noch Fixture-Verzeichnis.
- Performance: Große Canvas/annotierte Dokumente blockieren die Oberfläche
  nicht; Fortschrittsanzeige bleibt sichtbar und wird wieder entfernt.

## Umsetzung in Coding-Agent-Aufgaben

1. **UI-Agent**: UI-01 bis UI-06 in `test-obsidian-smoke.ps1` ausführen.
2. **Canvas-Agent**: UI-07/UI-08 mit einer stabilen Pointer-Event-Hilfe und
   DOM/Datei-Assertions ergänzen.
3. **Service-Agent**: WP-05 implementieren, dann API-01 bis API-08 als
   einzelne Integrationstestdateien hinzufügen.
4. **Navigation-Agent**: Kleine feste Response-Fixtures für NAV-01 bis NAV-06
   bereitstellen und Klick/Scroll-Assertions implementieren.

Die genaue Basisinfrastruktur steht in
[WORKPACKAGE_OBSIDIAN_CLI_TESTS.md](WORKPACKAGE_OBSIDIAN_CLI_TESTS.md).
