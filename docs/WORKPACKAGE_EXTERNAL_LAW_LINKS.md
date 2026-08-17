# Workpackage: Externe Gesetzesverweise im `AnnotatedHTML` auflösbar machen

## Ziel

Der SemaLogic-Server soll bei `rulesettype=AnnotatedHTML` externe Gesetzesverweise nicht nur als Text (`span.lawlink-external`), sondern mit maschinenlesbaren Zielinformationen ausgeben. Der Obsidian-Client kann damit bevorzugt eine im Gesetzeskatalog vorhandene annotierte HTML-Fassung öffnen und andernfalls auf Gesetze im Internet (GII) ausweichen.

Interne Verweise innerhalb desselben Gesetzes bleiben unverändert als Fragment-Links (`href="#law_…"`).

## Ausgangslage

Das aktuelle annotierte HTML enthält beispielsweise:

```html
<span class="lawlink lawlink-external">§ 12</span>
```

Das reicht nicht, um ein Ziel zu öffnen:

- Es gibt keine URL.
- Gesetzeskennung und Zielparagraph sind für Clients nicht verfügbar.
- Der Client kann nicht entscheiden, ob es im Repository/Katalog ein passendes `annotatedHTML` gibt.
- GII-Fallbacks können nicht zuverlässig aufgebaut werden.

Im Beispielbestand existieren externe Referenzen, aber keine externen HTTP-Links.

## Anforderungen

### 1. Externe Referenzen strukturiert ausgeben

Wenn der Annotator einen Verweis eindeutig einem anderen Gesetz und einer Normstelle zuordnen kann, muss er ein Anchor-Element ausgeben.

Empfohlenes Format:

```html
<span class="lawlink lawlink-external lawlink-resolved">
  <a
    href="https://www.gesetze-im-internet.de/aufenthg_2004/__25.html"
    target="_blank"
    rel="noopener noreferrer"
    data-sl-link-kind="external-law"
    data-sl-law-id="AufenthG"
    data-sl-law-title="Aufenthaltsgesetz"
    data-sl-target-id="law_AufenthG.p25"
    data-sl-catalog-url="/catalog/laws/AufenthG/annotated"
    data-sl-gii-url="https://www.gesetze-im-internet.de/aufenthg_2004/__25.html"
  >§ 25 Absatz 1</a>
</span>
```

| Attribut | Pflicht | Zweck |
| --- | ---: | --- |
| `data-sl-link-kind="external-law"` | Ja | Stabile Erkennung durch Clients |
| `data-sl-law-id` | Ja | Kanonische, stabile Gesetzeskennung |
| `data-sl-target-id` | Ja | Stabile ID der Zielstelle im annotierten HTML |
| `data-sl-gii-url` | Ja | Direkter, vollständiger GII-Fallback |
| `data-sl-catalog-url` | Empfohlen | API-/Repository-Ziel für das katalogisierte `annotatedHTML` |
| `href` | Ja | Browser-tauglicher Fallback; zunächst identisch zu `data-sl-gii-url` |
| `data-sl-law-title` | Optional | Anzeige, Debugging und Accessibility |

Der `href` darf nicht auf eine lokale Serverdatei oder einen nicht erreichbaren Repository-Pfad zeigen. Er muss als eigenständig öffentlicher Browser-Fallback funktionieren.

### 2. Katalogziel bevorzugen

Falls das Zielgesetz im Server-Katalog vorhanden ist, soll `data-sl-catalog-url` ausgegeben werden.

Der Katalog-Endpunkt muss eine Antwort liefern, aus der ein Client das annotierte HTML des Gesetzes beziehen kann. Das Dokument muss:

- das Ziel-Element mit `id=data-sl-target-id` enthalten,
- als vollständiges HTML-Dokument oder klar als HTML-Fragment gekennzeichnet sein,
- eine stabile Gesetzeskennung und einen Versions-/Standhinweis enthalten.

Beispiel einer möglichen API-Antwort:

```json
{
  "lawID": "AufenthG",
  "title": "Aufenthaltsgesetz",
  "source": "catalog",
  "html": "<section class=\"law\" id=\"law_AufenthG\">…</section>",
  "fragment": true,
  "targetID": "law_AufenthG.p25"
}
```

Die konkrete URL-Struktur darf zum bestehenden Server passen. Wichtig ist nur, dass die URL im HTML stabil und vom Client direkt nutzbar ist.

### 3. Auflösungszustände sauber unterscheiden

Die bestehenden Klassen sollen semantisch erhalten bleiben:

- `lawlink` / `lawlink-resolved`: internes Ziel im selben Dokument.
- `lawlink-external lawlink-resolved`: externes Gesetz eindeutig aufgelöst; enthält Anchor und Metadaten.
- `lawlink-external`: externes Gesetz erkannt, aber kein konkretes Ziel ermittelbar; kein erfundener Link.
- `lawlink-uncertain`: Gesetz oder Ziel ist mehrdeutig; kein Link.
- `lawlink-unresolved`: Verweis ist nicht auflösbar; kein Link.

Keine URL raten. Insbesondere bei verkürzten Verweisen wie „Absatz 2“ ohne zweifelsfreien Gesetzeskontext soll weiterhin kein externer Link ausgegeben werden.

### 4. Ziel-ID-Format vereinheitlichen

Die serverseitige Ziel-ID muss exakt dem `id` entsprechen, das der Annotator im Zielgesetz erzeugt.

Beispiel:

```html
<section class="law" id="law_AufenthG">
  <section id="law_AufenthG.p25">
```

Dann muss der externe Link enthalten:

```html
data-sl-target-id="law_AufenthG.p25"
```

Nicht zulässig sind clientseitig zu erratende Varianten wie `§25`, `25` oder ein GII-spezifischer Anker als alleinige Kennung.

### 5. GII-URL aus einer gepflegten Quelle bilden

Die Zuordnung von kanonischer Gesetzeskennung zu GII-Pfad soll nicht aus dem sichtbaren Gesetzestitel geraten werden.

Vorgabe:

- Die Registry/Katalogdaten enthalten pro Gesetz einen gepflegten GII-Basislink oder den vollständigen Paragraphen-Link.
- Die Paragraphen-Auflösung berücksichtigt die GII-konforme Darstellung von Sonderparagraphen wie `§ 25a`, `§ 104c` usw.
- Wenn kein belastbarer GII-Link bekannt ist, bleibt `data-sl-gii-url` weg und der Link wird nicht als `lawlink-resolved` ausgegeben.

## Nicht Teil dieses Workpackages

- Änderungen am Obsidian-Frontend.
- Öffnen eines Obsidian-Tabs oder Rendering des geladenen Katalogdokuments.
- Nachträgliche Auflösung unklarer Referenzen mittels LLM oder heuristischer Textsuche.
- Änderungen an internen Fragment-Links.

## Tests

### Unit-Tests für den Annotator

Mindestens diese Fälle abdecken:

1. Eindeutiger externer Verweis:

   ```text
   § 25 Absatz 1 des Aufenthaltsgesetzes
   ```

   Erwartung: `a[data-sl-link-kind="external-law"]`, `data-sl-law-id`, `data-sl-target-id`, `data-sl-gii-url`.

2. Externes Gesetz im Katalog:

   Erwartung: zusätzlich `data-sl-catalog-url`.

3. Externes Gesetz nicht im Katalog, aber bei GII:

   Erwartung: Anchor mit GII-Fallback, kein `data-sl-catalog-url`.

4. Externes Gesetz ohne bekannte GII-Zuordnung:

   Erwartung: kein Anchor und kein Status `lawlink-resolved`.

5. Mehrdeutiger oder verkürzter Verweis:

   ```text
   Absatz 2
   ```

   Erwartung: `lawlink-uncertain`, kein Anchor.

6. Interner Verweis:

   ```text
   § 2 Absatz 1
   ```

   Erwartung: unverändert `href="#law_<aktuellesGesetz>.p2.a1"`; keine externen Metadaten.

### Integrations-Test

Für ein annotiertes BAföG-Dokument prüfen:

- Alle extern als `lawlink-resolved` markierten Referenzen besitzen `data-sl-law-id`, `data-sl-target-id` und `data-sl-gii-url`.
- Bei gesetzeskatalogisierten Zielen liefert `data-sl-catalog-url` ein HTML, das das angegebene `data-sl-target-id` tatsächlich enthält.
- Es werden keine `http`-/`https`-Links ohne `rel="noopener noreferrer"` erzeugt.

## Akzeptanzkriterien

Das Workpackage ist abgeschlossen, wenn:

- eindeutig aufgelöste externe Gesetzesverweise klickbare Anchors sind;
- der Client ohne Textanalyse entscheiden kann, ob Katalog oder GII geöffnet werden soll;
- Katalogdokumente die angegebene Ziel-ID enthalten;
- unklare Referenzen nicht irrtümlich verlinkt werden;
- interne Backlinks unverändert funktionieren.
