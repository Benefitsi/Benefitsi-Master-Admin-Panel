# Partnerakquise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine persistierte Akquiseübersicht als Unterseite von Partner mit Kontaktstatus, Verlauf und Wiedervorlagen anbieten.

**Architecture:** Die vorhandene private Workspace-Speicherung enthält normal validierte Partnerakten mit reservierten Akquisefeldern. Eine zusätzliche Admin-Unterseite liest aktuelle Partner und diese Akten, ohne öffentliche Partnerdaten zu ändern. Bestehende Admin-Authentifizierung, Revisionsschutz und Historie gelten auch hier.

**Tech Stack:** Next.js App Router, React, TypeScript, bestehende Supabase-Workspace-RPCs, node:test/tsx, JSDOM.

**Spec:** `docs/superpowers/specs/2026-10-17-partner-acquisition-design.md`

## Global Constraints

- Route `/partners/acquisition`, Navigation unter Partner; sieben Hauptbereiche erhalten.
- Keine neue Datenbanktabelle, kein neues SQL-Schema, kein Service-Role-Client und keine Migration erforderlich.
- Bestehende Partner starten ohne Nachweis mit `unrecorded`; E-Mail-Entwürfe sind keine Kontakte.
- Lesen/Schreiben nur nach requireAdmin; vorhandene RLS und Revisions-RPCs nutzen.
- Vorhandene Workspace-Inhalte und Historie erhalten; keine automatische Nachricht oder Partneraktivierung.
- Vorhandene Abhängigkeiten wiederverwenden, keine Installation und kein zusätzlicher Buildcache.
- Freigegebene Schnittstellen im Spec sind die Übergabe zwischen Task 1 und Task 2.

## Task 1: Persistiertes Akquisemodell und Admin-Aktionen

**Files:**
- Create: `lib/acquisition/model.ts` (Typen, Validierung, Workspace-Codec, Zusammenführung, Datums-/Filter-/Kennzahlfunktionen)
- Create: `lib/acquisition/data.ts` (authentifizierte, testbare Transportfunktionen)
- Create: `app/partners/acquisition/actions.ts` (requireAdmin-Wrapper)
- Test: `tests/acquisition-model.test.mjs`, `tests/acquisition-data.test.mjs`, optional `tests/helpers/acquisition-fixture.mjs`

**Interfaces:** Consumes `WorkspacePage`, `Workspace`, `ActionResult` und vorhandene Workspace-Speicherfunktionen. Produces die vier Actions und alle Typen des Specs. Weitere reine Helfer sind zulässig; Signaturen der Actions unverändert halten.

- [ ] Step 1: Tests vor der Implementierung anlegen. Konkrete Erwartungen: Partner ohne Akquiseakte hat status unrecorded und lastContactDate leer; Kontakt am 2026-10-10 vor Kontakt am 2026-10-08 bleibt der letzte Kontakt; am Berliner Tag 2026-10-17 ist followUpDate 2026-10-16 überfällig und 2026-10-17 heute fällig; accepted/declined bleiben aus offenen Wiedervorlagen ausgeschlossen.

```js
test('speichern erhält normale Workspace-Notizen und Ressourcen',()=>{
  const page={...makePage(ws.id,'partner'),content:{...emptyContent(),blocks:[{id:'existing-note',type:'paragraph',text:'Alte Vereinbarung',checked:false}],links:[{id:'menu',title:'Menü',url:'https://example.test/menu',category:'Menü',note:''}]}}
  const document={page,fields:{...blankFields(),name:'Testhotel',status:'contacted'},contacts:[{id:'00000000-0000-4000-8000-000000000003',date:'2026-10-10',channel:'email',note:'Anfrage tatsächlich versendet'}]}
  const stored=encodeAcquisitionDocument(document)
  assert.equal(stored.content.blocks.find(b=>b.id==='existing-note').text,'Alte Vereinbarung')
  assert.equal(stored.content.links[0].url,'https://example.test/menu')
  assert.equal(decodeAcquisitionDocument(stored).fields.status,'contacted')
})
```

- [ ] Step 2: `node --import tsx --test tests/acquisition-model.test.mjs tests/acquisition-data.test.mjs` ausführen. Erwartet: neue Verhaltensverträge fehlen. Tests auf falsche Fehler prüfen.
- [ ] Step 3: Modell, tatsächliche Datenfunktionen und dünne Admin-Actions implementieren. Validierung und Codec ausschließlich im Modell halten. Transportfunktionen injizieren einen authentifizierten Client / vorhandene Workspace-Aktionen, damit Tests an der externen Grenze ansetzen.

```ts
export async function saveAcquisitionDocument(input:AcquisitionDocument):Promise<ActionResult<AcquisitionDocument>> {
  await requireAdmin()
  const page=encodeAcquisitionDocument(input)
  const saved=await saveWorkspacePage(page)
  if(!saved.ok)return saved
  return {ok:true,value:decodeAcquisitionDocument(saved.value)}
}
```

Die tatsächliche Implementierung muss daneben prüfen, dass bestehende Seiten nur innerhalb ihrer Akquiseidentität gespeichert werden; Datenfehler und Konflikte dürfen den lokalen Entwurf nicht überschreiben. Zulässige Seitentags/Feld-Namespaces dokumentieren. createAcquisitionWorkspace soll eine identisch bereits angelegte ID nach verlorener Antwort erkennen.

- [ ] Step 4: Tests für ungültige UUID/Enum/Datum/Website/zu große Inhalte, Paginationfehler statt Teilerfolg, Konflikt und Wiederholung ergänzen. Alle fokussierten Tests sowie bestehende Workspace-Modell-/Paginationtests ausführen.
- [ ] Step 5: Nur Task-Dateien committen. Bericht und Testergebnisse in der Task-Akte festhalten.

## Task 2: Partner-Unterseite, Oberfläche und Navigation

**Files:**
- Create: `app/partners/acquisition/page.tsx`
- Create: `components/acquisition/acquisition-app.tsx` (Übersicht und Detailwechsel)
- Create: `components/acquisition/acquisition-editor.tsx` (Felder, Kontakte, Speichern, Konflikt)
- Create: `components/acquisition/services.ts` (vier Action-Signaturen als injizierbarer Transport)
- Modify: `lib/admin-navigation.ts`, `app/admin-shell.tsx`
- Test: `tests/acquisition-ui.test.mjs`, `tests/admin-navigation.test.mjs`, `tests/admin-navigation-ui.test.mjs`
- Browser fixture: `tests/acquisition-browser-check.mjs`

**Interfaces:** Consumes vier Actions und `AcquisitionIndex/Document/Fields/Target` aus Task 1, `AdminShell` und vorhandene Workspace-UI-Bausteine. Produces fertig bedienbare Admin-Unterseite und genau einen aktiven Navigations-Unterpunkt.

- [ ] Step 1: Verhaltensprüfungen zuerst ergänzen: Akquise als Kind von Partner erreichbar, Partnerübersicht weiterhin erreichbar, auf /partners/acquisition genau ein aria-current=page. Echte React-Komponente soll einen vorhandenen unrecorded-Betrieb öffnen, Kontakt+Wiedervorlage speichern und nach Remount wiederfinden. Speicherfehler/Konflikt bewahren den Entwurf.

```js
await click(button('Testhotel'))
await fill(field('Kontaktstatus'),'contacted')
await fill(field('Nächster Schritt'),'Antwort nachfragen')
await fill(field('Wiedervorlage'),'2026-10-20')
await click(button('Speichern'))
await remount()
await click(button('Testhotel'))
assert.equal(field('Wiedervorlage').value,'2026-10-20')
```

- [ ] Step 2: Die neuen Tests ausführen und fehlendes Verhalten bestätigen. Vorhandene Tests, die Partner fälschlich als einzigen flachen Link festschreiben, auf den nun freigegebenen Vertrag aktualisieren.
- [ ] Step 3: Partner-Navigationsgruppe mit Partnerübersicht /partners und Akquise & Kontakte /partners/acquisition anlegen. Der aktivste Unterpunkt ist der längste passende Pfad, bestehende /partners/example-Unterpfade bleiben Partnerübersicht. Die übergeordnete Gruppe bleibt aktiv.
- [ ] Step 4: Route mit normalem AdminShell und requireAdmin-gesicherten initialen Daten anlegen. Die Client-App bekommt `initial` und optional `services`/`today`. Übersicht: Suchfeld, kombinierbare Filter, Kennzahlen zur gefilterten Auswahl, semantische Tabelle, leere-/Fehler-/Ladezustände und Interessent anlegen. Detail: Kontaktdaten, Status, nächster Schritt, Termine, drei Medienfelder, Notizen und append-only Kontaktverlauf. Bestehende Partner-/Workspace-Links ergänzen. Ungespeicherte Änderungen vor Verlassen schützen.
- [ ] Step 5: Reale UI-Verhaltenstests für Stadt/Branche/Statusfilter, neue unverknüpfte Interessenten, Kontaktprotokollierung, Fehler, Konflikt, doppelte Klicks und Remount ausführen. ESLint und TypeScript prüfen. Vorhandene Abhängigkeiten haben bekannte Versionabweichungen und eventuell fehlendes onnxruntime-web; unveränderte Basisfehler separat nachweisen statt Abhängigkeiten zu installieren.
- [ ] Step 6: Synthetische Browserfixture mit denselben React-Komponenten erstellen. Desktop und 390 px prüfen, speichern/neuladen, kein horizontaler Seitenüberlauf, beschriftete Felder, sichtbarer Fehler. Eigene Server und temporäre Ausgaben in finally entfernen. Kein Login-/Kontakt-/Produktionsdatentest durch erfundene Akquiseereignisse.
- [ ] Step 7: Implementierung committen. Abschlussreview gegen gesamten Spec, zielgerichtete neue Prüfungen nur bei Änderungen/Funden wiederholen. Release-/Prüfnotiz erstellen und den geprüften Stand als Branch/Entwurfs-PR sichern. Main und Produktion erst nach letzter Freigabe ändern.

## Planprüfung

Task 1 und 2 teilen ausschließlich die dokumentierten Typen und Action-Signaturen. Task 2 implementiert keine zweite Datenpersistenz. Der Akquisecode ändert `pageStatuses` nicht und leitet `lastContactDate` nicht aus Seitentimestamps ab. Jede Route-/Action-Grenze bleibt Admin-only. Quellen-/Feldprüfung für existierende Workspace-RPCs ist dokumentiert. Keine E-Mail-Integration, Medienveröffentlichung oder Datenbankmigration ist Teil dieses Plans.
