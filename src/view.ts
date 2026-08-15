import { DropdownComponent, ItemView, Notice, WorkspaceLeaf, ButtonComponent, MarkdownRenderer, RequestUrlParam, requestUrl, sanitizeHTMLToDom } from "obsidian";
import { slTexts, DebugLevMap, RulesettypesCommands, Rstypes_Semalogic, Rstypes_SemanticTree, Rstypes_KnowledgeGraph, Rstypes_Picture, Rstypes_ASP, Rstypes_AnnotatedHTML, Rstypes_AnnotatedHTML_WithBacklinks, DialectGen_Label, API_Defaults } from "./const"
import { SemaLogicPluginComm, DebugLevel, SemaLogicPluginSettings } from "../main"
import { slconsolelog } from './utils'
import { ViewUtils } from "./view_utils";
import { getHostPort } from "./utils";
import {
  Diagnostic, Diagnostics, Rulesout, RulesoutContent, RulesoutTextFormat,
  countFindings, diagnosticMessage, emptyDiagnostics, extractRulesout, markdownSource,
  normalizeDiagnostics, parseRulesout, requestAudience_Developer, requestAudience_User,
  scopeCss, sortDiagnostics, splitHtmlDocument, withAudience
} from "./rulesout";

export const SemaLogicViewType = "SemaLogicService";

// Wrapper for an inlined full document; also the scope its own CSS is confined to.
const SemaLogicDocumentClass = "sl-result-document";

function createLoggedSemaLogicRequest(request: RequestUrlParam, semaLogicJsonRequestBody: any) {
  const headers = { ...(request.headers ?? {}) } as Record<string, string>
  if (headers["Authorization"] != undefined) {
    headers["Authorization"] = "<redacted>"
  }
  return {
    url: request.url,
    method: request.method,
    headers,
    body: request.body,
    rulesLength: semaLogicJsonRequestBody?.text?.[0]?.rules?.length ?? 0,
    interpreteLength: semaLogicJsonRequestBody?.interprete?.[0]?.rules?.length ?? 0
  }
}

// Everything a caller can need from one /rules/parse round trip. `raw` is the
// untouched response body, `payload` the extracted markup/SVG/canvas and
// `diagnostics` the findings - present for 2xx and 4xx alike.
export type SemaLogicParseResult = {
  status: number
  raw: string
  rulesout?: Rulesout
  payload: RulesoutContent
  diagnostics: Diagnostics
}

// The arguments of the last parse request, so the diagnostics panel can repeat
// it with audience=developer without the caller being involved.
type LastParseRequest = {
  settings: SemaLogicPluginSettings
  vAPI_URL: string
  dialectID: string
  bodytext: string
  outPutFormat: string
  interpreteText?: string
  engine?: string
}

// Progress snapshot delivered by GET /session/progress. The server reports it for
// every long running request (DialectEngine as well as SL-Interpreter).
type ServerProgressPayload = {
  phase?: string
  message?: string
  itemsDone?: number
  itemsTotal?: number
  llmCalls?: number
  chunk?: string
  elapsedMs?: number
  done?: boolean
  // True when the operation ended in an error rather than completing.
  failed?: boolean
}

type ServerProgressResponse = {
  sid?: string
  running?: boolean
  progress?: ServerProgressPayload
}

export class SemaLogicView extends ItemView {
  view_utils: ViewUtils
  myAction!: HTMLElement
  dropdownButton!: DropdownComponent
  copyButton!: ButtonComponent
  debugButton!: ButtonComponent
  viewModeButton!: ButtonComponent
  debugContent: string[]
  zoomIn!: ButtonComponent
  zoomRatio!: ButtonComponent
  zoomOut!: ButtonComponent
  slComm!: SemaLogicPluginComm
  scaleRatio: number
  currResult: string = ""
  // Decoded shape of the last response (see src/rulesout.ts).
  currKind: string = "raw"
  currFragment: boolean = true
  currSource: string | undefined
  // "markdown" where the payload turned out to be markdown rather than markup.
  currFormat: RulesoutTextFormat | undefined
  currDiagnostics: Diagnostics = emptyDiagnostics()
  currAudience: string = requestAudience_User
  // Open/closed state per severity section, kept while the view lives.
  sectionOpen: Record<string, boolean> = {}
  // Result display mode while no settings are reachable (view without plugin comm).
  resultAsSourceFallback: boolean = false
  lastParseRequest: LastParseRequest | undefined
  bodytext: string = ""
  apiURL: string = ""
  dialectID: string = ""
  headerEl!: HTMLElement
  controlsEl!: HTMLElement
  scaleControlsEl!: HTMLElement
  diagToggleEl!: HTMLElement
  diagnosticsEl!: HTMLElement
  resultEl!: HTMLElement
  errorEl!: HTMLElement
  progressToken: number
  progressTitle: string
  progressFallbackMessage: string
  progressEl: HTMLElement | undefined
  progressPhaseEl: HTMLElement | undefined
  progressElapsedEl: HTMLElement | undefined
  progressMessageEl: HTMLElement | undefined
  progressMetaEl: HTMLElement | undefined
  progressBarEl: HTMLElement | undefined
  progressFillEl: HTMLElement | undefined

  public debugInline: boolean

  public getOutPutFormat(): string {
    return this.dropdownButton.getValue()
  }

  // Reflect the current output mode in the dropdown (e.g. "DialectEngine" after a
  // dialect-engine call). setValue does not fire onChange, so this is display-only.
  public setOutPutFormat(value: string): void {
    if (this.dropdownButton != undefined) {
      this.dropdownButton.setValue(value)
    }
  }

  public showDialectEngineHint(): void {
    this.currResult = ""
    this.currDiagnostics = emptyDiagnostics()
    if (this.headerEl == undefined || this.controlsEl == undefined || this.resultEl == undefined) {
      this.setNewInitial(this.getOutPutFormat(), false)
    }
    this.updateScaleControls(this.getOutPutFormat())
    if (this.errorEl != undefined) {
      this.errorEl.empty()
    }
    if (this.diagnosticsEl != undefined) {
      this.diagnosticsEl.empty()
    }
    if (this.resultEl != undefined) {
      this.resultEl.empty()
      this.resultEl.createEl("p", { text: "Bitte Text markieren und über die direkten Buttons oder Menueinträge die DialectEngine auswählen." })
    }
  }

  public getDebugInline(): boolean {
    return this.debugInline
  }

  public getContent(): string {
    return this.view_utils.getContent(this.contentEl, this.getOutPutFormat())
  }

  public appendDebugContent(text: string) {
    this.debugContent.push(text)
  }

  // Copies exactly what the source view shows: the payload as it arrived, with
  // the mojibake repair applied, so a markdown result (AnnotatedHTML) lands in
  // the clipboard as its own source rather than as rendered text.
  copyToCb() {
    const text = this.getSourceText()
    if (text.length == 0) {
      new Notice("SemaLogic: nothing to copy - the result is empty.")
      return
    }
    void this.writeToClipboard(text)
      .then(() => {
        new Notice("SemaLogic: result copied to clipboard.")
      })
      .catch((e) => {
        slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Copy to clipboard failed: ${String(e)}`)
        new Notice(`SemaLogic: copy to clipboard failed - ${String(e)}`)
      })
  }

  // navigator.clipboard.write(ClipboardItem) is the part of the async clipboard
  // API Obsidian's Electron does not reliably provide, and it rejects with
  // NotAllowedError whenever the document is not focused. writeText is the
  // supported path; execCommand("copy") on a detached textarea covers the rest.
  private async writeToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText != undefined) {
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch (e) {
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
          `clipboard.writeText refused, falling back to execCommand: ${String(e)}`)
      }
    }
    this.copyViaTextarea(text)
  }

  private copyViaTextarea(text: string): void {
    const helper = this.contentEl.createEl("textarea", { cls: "sl-clipboard-helper" })
    helper.value = text
    try {
      helper.focus()
      helper.select()
      if (document.execCommand("copy") == false) {
        throw new Error("execCommand(\"copy\") was rejected")
      }
    } finally {
      helper.remove()
    }
  }

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.scaleRatio = 100
    this.view_utils = new ViewUtils
    this.debugInline = false
    this.debugContent = []
    this.progressToken = 0
    this.progressTitle = "SemaLogic"
    this.progressFallbackMessage = "Running request ..."
  }

  public setComm(comm: SemaLogicPluginComm) {
    if (this.slComm != comm) {
      this.slComm = comm
      //this.slComm.setSlView(this)
      this.setNewInitial(this.slComm.slPlugin.settings.mySLSettings[this.slComm.slPlugin.settings.mySetting].myOutputFormat, false)
    }
  }

  getViewType() {
    return SemaLogicViewType;
  }

  getDisplayText() {
    return SemaLogicViewType;
  }

  // Law links in a SemaLogic result point to another element of the rendered
  // response, not to a position in a Markdown editor. Keep this navigation in
  // the view so the plugin can use the same global link handler for both.
  public navigateToLawLinkTarget(targetId: string): boolean {
    const target = Array.from(this.contentEl.querySelectorAll<HTMLElement>("[id]"))
      .find((element) => element.id == targetId)
    if (target == undefined) {
      return false
    }
    target.scrollIntoView({ block: "center" })
    return true
  }

  onload(): void {
    this.navigation = true
    this.contentEl.contentEditable = 'true'
    this.debugInline == false
  }

  getDebugButtonText(): string {
    if (this.debugInline == true) {
      return 'InlineDebug is on'
    } else {
      return 'InlineDebug is off'
    }
  }

  createDropDownButtonForOutPutFormat(container: HTMLElement, dropDownValue: string): HTMLElement {
    this.dropdownButton = new DropdownComponent(container)
      .addOption(RulesettypesCommands[Rstypes_Semalogic][1], RulesettypesCommands[Rstypes_Semalogic][0])
      .addOption(RulesettypesCommands[Rstypes_ASP][1], RulesettypesCommands[Rstypes_ASP][0])
      .addOption(RulesettypesCommands[Rstypes_Picture][1], RulesettypesCommands[Rstypes_Picture][0])
      .addOption(RulesettypesCommands[Rstypes_SemanticTree][1], RulesettypesCommands[Rstypes_SemanticTree][0])
      .addOption(RulesettypesCommands[Rstypes_KnowledgeGraph][1], RulesettypesCommands[Rstypes_KnowledgeGraph][0])
      .addOption(RulesettypesCommands[Rstypes_AnnotatedHTML][1], RulesettypesCommands[Rstypes_AnnotatedHTML][0])
      .addOption(RulesettypesCommands[Rstypes_AnnotatedHTML_WithBacklinks][1], RulesettypesCommands[Rstypes_AnnotatedHTML_WithBacklinks][0])
      .addOption(DialectGen_Label, DialectGen_Label)
      .setValue(dropDownValue)
      .onChange(async (value) => {
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, 'Set ViewOutputFormat: ' + value);
        // Stable test trace: this is written when the DropdownComponent's
        // actual change handler starts, independently of the later HTTP reply.
        this.contentEl.setAttr('data-sl-test-last-selection', value)
        this.slComm.slPlugin.updateOutstanding = true
        dropDownValue = value
        this.dropdownButton.setValue(value)
        this.updateScaleControls(value)
        if (value == DialectGen_Label) {
          // Marker state set when a dialect engine was invoked (via button/menu);
          // there is no live re-parse for this entry.
          slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview,
            'Dropdown set to DialectEngine (marker, no re-parse)')
          this.showDialectEngineHint()
          return
        }
        if (value == RulesettypesCommands[Rstypes_KnowledgeGraph][1]) {
          await this.slComm.slPlugin.activateKnowledgeView()
        }

        // Give interactive users immediate feedback and await the request here.
        // Previously this promise was left unattended, so an exception could
        // look exactly like a dropdown that did nothing.
        this.contentEl.setAttr('data-sl-test-last-request-status', 'pending')
        this.resultEl?.empty()
        this.resultEl?.createEl('p', { text: `Requesting ${value}...`, cls: 'sl-request-pending' })
        try {
          const result = await this.getSemaLogicParse(this.slComm.slPlugin.settings, this.apiURL, this.dialectID, this.bodytext, false, value)
          if (value == RulesettypesCommands[Rstypes_KnowledgeGraph][1]) {
            this.slComm.slPlugin.updateKnowledgeCanvas(result)
          }
        } catch (error) {
          this.contentEl.setAttr('data-sl-test-last-request-status', 'failed')
          slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview,
            `Dropdown request failed for ${value}: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
    this.dropdownButton.selectEl.setAttr("data-sl-test", "output-format")
    return container
  }
  createCopyToClipboardButton(container: HTMLElement): HTMLElement {
    this.copyButton = new ButtonComponent(container)
      .setButtonText('Copy to Clipboard')
      .onClick((mouse_event: MouseEvent) => {
        this.copyToCb()
      })
    this.copyButton.buttonEl.setAttr("data-sl-test", "copy-result")
    return container
  }
  createDebugButton(container: HTMLElement): HTMLElement {
    if (DebugLevel != DebugLevMap.DebugLevel_Off) {
      this.debugButton = new ButtonComponent(container)
        .setButtonText(this.getDebugButtonText())
        .onClick((mouse_event: MouseEvent) => {
          if (this.debugInline == true) {
            this.debugInline = false
            this.debugContent = []
          } else { this.debugInline = true }
          if (this.slComm.slview != undefined) {
            slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, 'Set InlineDebugging: ' + this.debugInline);
            //this.setNewInitial(dropDownValue)
          }
          this.updateView()
        })
    }
    return container
  }

  // Switches the result area between the rendered output and its source text.
  // Only the payload is affected - findings, errors and debug output keep their
  // own rendering.
  createViewModeButton(container: HTMLElement): HTMLElement {
    this.viewModeButton = new ButtonComponent(container)
      .onClick(() => { void this.toggleResultAsSource() })
    this.viewModeButton.buttonEl.addClass("sl-view-mode-toggle")
    this.viewModeButton.buttonEl.setAttr("data-sl-test", "result-mode-toggle")
    this.refreshViewModeButton()
    return container
  }

  private refreshViewModeButton(): void {
    if (this.viewModeButton == undefined) { return }
    const source = this.getResultAsSource()
    this.viewModeButton
      .setButtonText(source ? "Source" : "Rendered")
      .setTooltip(source ? "Show the rendered result" : "Show the result as source text")
    this.viewModeButton.buttonEl.toggleClass("is-source", source)
  }

  // The result display mode. Persisted in the global settings, so the last
  // choice is what comes up again and the settings tab can change it as well.
  public getResultAsSource(): boolean {
    const settings = this.slComm?.slPlugin?.settings
    if (settings == undefined) { return this.resultAsSourceFallback }
    return settings.showResultAsSource === true
  }

  private async toggleResultAsSource(): Promise<void> {
    const next = !this.getResultAsSource()
    const plugin = this.slComm?.slPlugin
    if (plugin != undefined) {
      plugin.settings.showResultAsSource = next
      await plugin.saveSettings()
    } else {
      this.resultAsSourceFallback = next
    }
    slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, 'Set ResultAsSource: ' + next)
    this.updateView()
  }

  // Shared by the visible result-mode button and the command-palette test
  // command. Keeping this public avoids a test-only DOM event shim.
  public async toggleResultDisplayMode(): Promise<void> {
    await this.toggleResultAsSource()
  }

  createScaleButtons(container: HTMLElement): HTMLElement {
    // Zoom in
    this.zoomIn = new ButtonComponent(container)
      .setButtonText('-')
      .onClick((mouse_event: MouseEvent) => {
        this.scaleRatio = this.scaleRatio / 2
        if (this.zoomRatio != null) { this.zoomRatio.setButtonText(String(this.scaleRatio)) }
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, 'Set ScaleRatio to: ' + this.scaleRatio);
        this.updateView()
      })

    this.zoomRatio = new ButtonComponent(container)
      .setButtonText(String(this.scaleRatio))
      .onClick((mouse_event: MouseEvent) => {
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, 'ScaleRatio := ' + this.scaleRatio);
      })

    this.zoomOut = new ButtonComponent(container)
      .setButtonText('+')
      .onClick((mouse_event: MouseEvent) => {
        this.scaleRatio = this.scaleRatio * 2
        this.zoomRatio.setButtonText(String(this.scaleRatio))
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, 'Set ScaleRatio to: ' + this.scaleRatio);
        this.updateView()
      })

    return container
  }

  checkContainerContent(): boolean {
    if (this.containerEl.children != undefined) {
      if (this.containerEl.children[1].textContent?.substring(0, slTexts['HeaderSL'].length) == slTexts['HeaderSL']) {
        return true
      } else {
        return false
      }
    } else {
      return false
    }
  }

  deleteContainerContent(): void {
    if (this.containerEl.children != undefined) {
      for (let i = 0; i < this.containerEl.children.length; i++) {
        if (this.containerEl.children[i].nodeName == "p") {
          while (this.containerEl.children[i] != undefined) {
            this.containerEl.children[i].empty
          }
        }
      }
    }
  }


  updateScaleControls(outputFormat: string): void {
    if (this.scaleControlsEl == undefined) {
      this.scaleControlsEl = this.controlsEl.createEl("span")
      this.errorEl = this.contentEl.createEl("div", { cls: "semalogic-error" })
    }
    this.scaleControlsEl.empty()
    // Zoom scales the rendered SVG; in source view there is nothing to scale.
    if (outputFormat == RulesettypesCommands[Rstypes_Picture][1] && !this.getResultAsSource()) {
      this.createScaleButtons(this.scaleControlsEl)
    }
  }

  public setNewInitial(dropDownValue: string, now: boolean) {
    if (!this.checkContainerContent() || now || this.headerEl == undefined) {
      this.contentEl.empty()
      this.contentEl.setAttr("data-sl-test", "semalogic-view")
      this.headerEl = this.contentEl.createEl("h4", { text: slTexts['HeaderSL'] })
      this.controlsEl = this.contentEl.createEl("div")
      this.scaleControlsEl = this.controlsEl.createEl("span")
      this.errorEl = this.contentEl.createEl("div", { cls: "semalogic-error", attr: { "data-sl-test": "error" } })
      this.diagnosticsEl = this.contentEl.createEl("div", { cls: "sl-diagnostics", attr: { "data-sl-test": "diagnostics" } })
      this.resultEl = this.contentEl.createEl("div", { attr: { "data-sl-test": "result" } })

      this.createDropDownButtonForOutPutFormat(this.controlsEl, dropDownValue)
      this.createCopyToClipboardButton(this.controlsEl)
      this.createViewModeButton(this.controlsEl)
      this.createDebugButton(this.controlsEl)
      // Diagnostics toggles sit in the control row, directly behind InlineDebug.
      this.diagToggleEl = this.controlsEl.createEl("span", { cls: "sl-diag-toggles" })
      this.renderDiagnosticToggles()
      this.updateScaleControls(dropDownValue)
    } else {
      this.deleteContainerContent()
    }
  }

  async onOpen() {
    this.setNewInitial(RulesettypesCommands[Rstypes_Semalogic][1], false)
    // this.containerEl.children[1].appendText("let's begin");
  }

  async onClose() {
    this.hideServerProgress()
  }

  showError(fragment: DocumentFragment) {
    if (this.errorEl == undefined) {
      this.errorEl = this.contentEl.createEl("div", { cls: "semalogic-error" })
    }
    this.errorEl.empty()
    this.errorEl.appendChild(fragment)
  }
  onunload(): void {
    this.hideServerProgress()

    if (this.slComm.slPlugin != undefined) {
      this.slComm.slPlugin.activated = false
      this.slComm.slPlugin.myStatus.setText('SemaLogic is off');
    }

  }

  createSemaLogicRequestBody(dialectID: string, bodytext: string, outPutFormat: string, interpreteText?: string): any {
    slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, 'Context: ' + dialectID + ' Bodytext: ' + bodytext)
    
    // Determine if backlinks are requested (for AnnotatedHTML_backlinks variant)
    const backlinksRequested = outPutFormat === "AnnotatedHTML_backlinks"
    const rulesettype = backlinksRequested ? "AnnotatedHTML" : outPutFormat
    
    let semaLogicJsonRequestBody: any = {
      "text": [
        {
          "textID": "ParsingOnTheFly",
          "dialectID": dialectID,
          "rules": bodytext
        }
      ],
      "filter": {},
      "persistency": false,
      "rulesettype": rulesettype
    }
    
    // Add backlinks flag if requested (API 00.03.01+)
    if (backlinksRequested) {
      semaLogicJsonRequestBody["backlinks"] = true
    }
    
    if (interpreteText != undefined) {
      semaLogicJsonRequestBody["interprete"] = [
        {
          "textID": "InterpretingOnTheFly",
          "dialectID": dialectID,
          "rules": interpreteText
        }
      ]
    }
    return semaLogicJsonRequestBody
  }

  private createAuthorizationHeader(settings: SemaLogicPluginSettings): Record<string, string> {
    if (settings.mySLSettings[settings.mySetting].myUseHttpsSL && settings.mySLSettings[settings.mySetting].myUserSL != '') {
      return {
        "Authorization": "Basic " + btoa(settings.mySLSettings[settings.mySetting].myUserSL + ":" + settings.mySLSettings[settings.mySetting].myPasswordSL)
      }
    }
    return {}
  }

  createSemaLogicRequest(settings: SemaLogicPluginSettings, vAPI_URL: string, semaLogicJsonRequestBody: any, engine?: string): RequestUrlParam {
    // Optional OpenAPI `engine` query parameter (e.g. dialectgen_v1/_v2).
    const url = (engine != undefined && engine != '')
      ? vAPI_URL + (vAPI_URL.includes('?') ? '&' : '?') + 'engine=' + encodeURIComponent(engine)
      : vAPI_URL
    let request: RequestUrlParam = {
      url: url,
      method: 'POST',
      headers: {
        "content-type": "application/json",
        ...this.createAuthorizationHeader(settings)
      },
      body: JSON.stringify(semaLogicJsonRequestBody),
      // Do not throw on 4xx/5xx so we can read the server's error body (e.g. 422 reason).
      throw: false
    }

    if (settings.mySLSettings[settings.mySetting].myUseHttpsSL && settings.mySLSettings[settings.mySetting].myUserSL != '') {
      request = {
        url: url,
        method: 'POST',
        headers: {
          "content-type": "application/json",
          ...this.createAuthorizationHeader(settings)
        },
        body: JSON.stringify(semaLogicJsonRequestBody),
        throw: false
      }
    }
    slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, 'Parsingsstring')
    slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, semaLogicJsonRequestBody)
    slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, "SemaLogic parse request", createLoggedSemaLogicRequest(request, semaLogicJsonRequestBody))
    return request
  }

  private createServerProgressRequest(settings: SemaLogicPluginSettings, sid: string): RequestUrlParam {
    return {
      url: getHostPort(settings) + API_Defaults.rules_progress + "?sid=" + encodeURIComponent(sid),
      method: 'GET',
      headers: {
        "accept": "application/json",
        ...this.createAuthorizationHeader(settings)
      },
      throw: false
    }
  }

  // Shows the progress overlay for a running server request and starts polling
  // /rules/progress for the given sid. `title` labels the overlay (e.g. "Dialect",
  // "SL-Interpreter"), `startMessage` is displayed until the first snapshot arrives.
  public startServerProgress(settings: SemaLogicPluginSettings, sid: string, title: string, startMessage: string): number {
    const token = ++this.progressToken
    this.progressTitle = title
    this.progressFallbackMessage = startMessage
    this.renderServerProgress({
      phase: "baseline",
      message: startMessage,
      itemsDone: 0,
      itemsTotal: 0,
      llmCalls: 0,
      chunk: "",
      elapsedMs: 0,
      done: false
    })
    void this.pollServerProgress(settings, sid, token)
    return token
  }

  public stopServerProgress(token: number): void {
    if (token != this.progressToken) {
      return
    }
    this.progressToken++
    this.hideServerProgress()
  }

  private async pollServerProgress(settings: SemaLogicPluginSettings, sid: string, token: number): Promise<void> {
    let sawProgress = false
    while (token == this.progressToken) {
      try {
        const response = await requestUrl(this.createServerProgressRequest(settings, sid))
        if (response.status == 200) {
          const snapshot = JSON.parse(response.text) as ServerProgressResponse
          if (snapshot.progress != undefined) {
            sawProgress = true
            this.renderServerProgress(snapshot.progress)
            if (snapshot.progress.done) {
              return
            }
          }
          if (snapshot.running == false && sawProgress) {
            return
          }
        } else {
          slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Progress poll status ${response.status}`)
        }
      } catch (e) {
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Progress poll failed: ${String(e)}`)
      }
      if (token != this.progressToken) {
        return
      }
      await this.sleep(700)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  private ensureServerProgressElements(): void {
    if (this.progressEl != undefined) {
      return
    }
    const root = document.body.createEl("div", { cls: "sl-progress" })
    const box = root.createEl("div", { cls: "sl-progress-box" })
    const header = box.createEl("div", { cls: "sl-progress-header" })
    this.progressPhaseEl = header.createEl("span", { cls: "sl-progress-phase" })
    this.progressElapsedEl = header.createEl("span", { cls: "sl-progress-elapsed" })
    this.progressMessageEl = box.createEl("div", { cls: "sl-progress-message" })
    this.progressBarEl = box.createEl("div", { cls: "sl-progress-bar" })
    this.progressFillEl = this.progressBarEl.createEl("div", { cls: "sl-progress-fill" })
    this.progressMetaEl = box.createEl("div", { cls: "sl-progress-meta" })
    this.progressEl = root
  }

  private renderServerProgress(progress: ServerProgressPayload): void {
    this.ensureServerProgressElements()
    const phase = progress.phase?.trim() || "baseline"
    const message = progress.message?.trim() || this.progressFallbackMessage
    const itemsDone = progress.itemsDone ?? 0
    const itemsTotal = progress.itemsTotal ?? 0
    const llmCalls = progress.llmCalls ?? 0
    const chunk = progress.chunk?.trim() ?? ""
    const elapsedMs = progress.elapsedMs ?? 0
    if (this.progressPhaseEl != undefined) {
      this.progressPhaseEl.setText(`${this.progressTitle} ${phase}`)
      // The server flags an operation that ended in an error rather than completing.
      if (progress.failed == true) {
        this.progressPhaseEl.addClass("is-failed")
      } else {
        this.progressPhaseEl.removeClass("is-failed")
      }
    }
    if (this.progressElapsedEl != undefined) {
      this.progressElapsedEl.setText(this.formatElapsedMs(elapsedMs))
    }
    if (this.progressMessageEl != undefined) {
      this.progressMessageEl.setText(message)
    }
    if (this.progressMetaEl != undefined) {
      const metaParts = [`${itemsDone}/${itemsTotal} item(s)`, `${llmCalls} LLM call(s)`]
      if (chunk.length > 0) {
        metaParts.push(`chunk ${chunk}`)
      }
      this.progressMetaEl.setText(metaParts.join(" · "))
    }
    this.updateServerProgressBar(itemsDone, itemsTotal)
  }

  private updateServerProgressBar(itemsDone: number, itemsTotal: number): void {
    if (this.progressBarEl == undefined || this.progressFillEl == undefined) {
      return
    }
    const total = itemsTotal > 0 ? itemsTotal : 0
    if (total == 0) {
      this.progressBarEl.addClass("is-indeterminate")
      this.progressFillEl.style.width = "42%"
      return
    }
    this.progressBarEl.removeClass("is-indeterminate")
    const ratio = Math.max(0, Math.min(1, itemsDone / total))
    this.progressFillEl.style.width = `${Math.round(ratio * 100)}%`
  }

  private formatElapsedMs(elapsedMs: number): string {
    if (elapsedMs <= 0) {
      return "0.0 s"
    }
    return `${(elapsedMs / 1000).toFixed(1)} s`
  }

  private hideServerProgress(): void {
    this.progressEl?.remove()
    this.progressEl = undefined
    this.progressPhaseEl = undefined
    this.progressElapsedEl = undefined
    this.progressMessageEl = undefined
    this.progressMetaEl = undefined
    this.progressBarEl = undefined
    this.progressFillEl = undefined
  }

  getRequestEmbed(content: string): string {
    if (this.currKind == "svg" || this.getOutPutFormat() == RulesettypesCommands[Rstypes_Picture][1]) {
      // Zoom for Picture
      // The 00.03.00 payload keeps the XML prolog and generator comment of the
      // original document; both must go before the markup is nested in our
      // scaling <svg> wrapper.
      content = stripXmlProlog(content)
      // try to get original viewbox size
      let viewBoxString: string
      const beginVB = content.indexOf('viewBox')
      if (beginVB > 0) {
        const endVB = content.indexOf('\"', content.indexOf('\"', beginVB) + 1)
        viewBoxString = content.substring(beginVB, endVB + 1)
      } else {
        viewBoxString = 'viewBox = "0 0 16 9"'
      }
      content = content.replace("<body>", "")
      content = content.replace("</body>", "")

      let header: string
      header = '<svg  ' + viewBoxString + ' width = "' + String(this.scaleRatio) + '%" xmlns = "http://www.w3.org/2000/svg" >\n'
      header = header + content
      header = header + '</svg>'
      return header
    } else {
      return content
    }
  }

  private repairUtf8Mojibake(content: string): string {
    if (!/[ÃÂâ]/.test(content)) {
      return content
    }
    try {
      const latin1Bytes = Uint8Array.from(Array.from(content), (char) => char.charCodeAt(0) & 0xff)
      const decoded = new TextDecoder("utf-8").decode(latin1Bytes)
      if (this.countMojibakeMarkers(decoded) < this.countMojibakeMarkers(content)) {
        return decoded
      }
    } catch (e) {
      slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `UTF-8 repair skipped: ${String(e)}`)
    }
    return content
  }

  private countMojibakeMarkers(content: string): number {
    const matches = content.match(/[ÃÂâ]/g)
    return matches?.length ?? 0
  }

  getCurrResult(): string {
    if (this.currKind == "engine") {
      return this.repairUtf8Mojibake(this.currResult)
    }
    return this.getRequestEmbed(this.currResult)
  }

  getCurrHTML(): void {
    if (this.resultEl == undefined) {
      this.resultEl = this.contentEl.createEl("div")
    }
    let responseContent = this.resultEl.createEl('div');

    if (this.debugInline == true) {
      this.debugContent.forEach(value => {
        const textline = responseContent.createEl("span", { text: value + "\n", cls: "debuginline" })
        //textline.style.cssText = 'white-space: pre;' //; white-space: pre-line;'
      })
      return
    }

    // AnnotatedHTML currently echoes the submitted text; say so instead of
    // pretending the markup carries annotations.
    if (this.currSource == "echo") {
      responseContent.createEl("p", {
        text: "AnnotatedHTML: the service echoes the submitted text - the annotator is not active yet.",
        cls: "sl-annotated-hint"
      })
    }

    // Source view: the payload as it arrived - markup, SVG or plain text, in
    // coding style instead of rendered.
    if (this.getResultAsSource()) {
      this.renderSourceText(responseContent, this.getSourceText())
      return
    }

    if (this.currKind == "asp" || this.getOutPutFormat() == RulesettypesCommands[Rstypes_ASP][1]) {
      let resulttextarray = this.getCurrResult().split('\n')
      resulttextarray.forEach(value => {
        const textline = responseContent.createEl("span", { text: value + "\n", cls: "debuginline" })
        // textline.style.cssText = 'white-space: pre;' //; white-space: pre-line;'
      })
      return
    }

    // Markdown payload (AnnotatedHTML, or an engine declaring text/markdown):
    // rendered by Obsidian itself, so links, callouts and tables behave as in a
    // note.
    if (this.currFormat == "markdown") {
      this.renderMarkdownResult(responseContent, markdownSource(this.currResult, this.currFragment))
      return
    }

    if (this.currKind == "html" && this.currFragment == false) {
      // A complete <!DOCTYPE html> document (SemanticTree). It is rendered like
      // every other output: its body markup goes into the view, its own style
      // rules come along scoped to that element.
      this.renderFullDocument(responseContent, this.currResult)
      return
    }

    responseContent.createEl("p", { text: " " })
    responseContent.after(sanitizeHTMLToDom(this.getCurrResult()))
  }

  // The untouched payload for the source view: no SVG zoom wrapper, no
  // sanitizing - only the mojibake repair the engine output needs to be legible.
  private getSourceText(): string {
    if (this.currKind == "engine") {
      return this.repairUtf8Mojibake(this.currResult)
    }
    return this.currResult
  }

  // Renders text as code: never parsed as markup, so tags stay visible.
  private renderSourceText(container: HTMLElement, text: string): void {
    const pre = container.createEl("pre", { cls: "sl-result-source" })
    pre.createEl("code", { text: text.length > 0 ? text : "<empty result>" })
  }

  // Renders markdown the way Obsidian renders a note. `markdown-rendered` is
  // what carries the reading-view styles; the source path resolves relative and
  // internal links against the note the request came from.
  private renderMarkdownResult(container: HTMLElement, markdown: string): void {
    const scope = container.createEl("div", { cls: "sl-result-markdown markdown-rendered" })
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? ""
    void MarkdownRenderer.renderMarkdown(markdown, scope, sourcePath, this)
  }

  // Inlines a full HTML document: doctype, <html>, <head> and any script go
  // away, the body markup is sanitized like every other result.
  private renderFullDocument(container: HTMLElement, documentHtml: string): void {
    const parts = splitHtmlDocument(documentHtml)
    const scope = container.createEl("div", { cls: SemaLogicDocumentClass })
    const css = scopeCss(parts.css, `.${SemaLogicDocumentClass}`)
    if (css.length > 0) {
      scope.createEl("style", { text: css })
    }
    scope.appendChild(sanitizeHTMLToDom(parts.body))
  }

  updateView(): void {
    if (this.headerEl == undefined || this.controlsEl == undefined || this.resultEl == undefined) {
      this.setNewInitial(this.getOutPutFormat(), false)
    }
    this.updateScaleControls(this.getOutPutFormat())
    this.refreshViewModeButton()
    if (this.errorEl != undefined) {
      this.errorEl.empty()
    }
    if (this.resultEl != undefined) {
      this.resultEl.empty()
    }
    this.renderDiagnostics()
    this.getCurrHTML()
  }

  // Diagnostics are part of every reply, so the finding count is rendered
  // unconditionally - a clean parse says "no findings" instead of showing nothing.
  private renderDiagnostics(): void {
    if (this.diagnosticsEl == undefined) {
      this.diagnosticsEl = this.contentEl.createEl("div", { cls: "sl-diagnostics", attr: { "data-sl-test": "diagnostics" } })
    }
    this.diagnosticsEl.empty()
    this.renderDiagnosticToggles()
    if (this.debugInline == true) { return }

    const diagnostics = this.currDiagnostics
    const summary = diagnostics.summary
    const total = countFindings(summary)

    const headerEl = this.diagnosticsEl.createEl("div", { cls: "sl-diag-summary" })
    headerEl.createEl("span", {
      text: this.formatDiagnosticsSummary(summary, total),
      cls: total > 0 ? "sl-diag-count is-active" : "sl-diag-count"
    })

    if (diagnostics.items.length == 0) { return }

    const entries = this.collapseDiagnostics(diagnostics)

    // `blocking` means the input could not be interpreted at all, so it is
    // neither collapsed nor hideable - it explains why there is no result.
    const blocking = entries.filter(entry => severityOf(entry.item) == "blocking")
    if (blocking.length > 0) {
      const listEl = this.diagnosticsEl.createEl("div", { cls: "sl-diag-list" })
      blocking.forEach(entry => this.renderDiagnosticItem(listEl, entry.item, entry.count))
    }

    this.renderDiagnosticSection("defect", entries)
    this.renderDiagnosticSection("suspect", entries)
    this.renderDiagnosticSection("note", entries)
  }

  // One section per severity, collapsed unless it was opened - by the user or
  // by switching its toggle on. Hidden entirely when its button is off.
  private renderDiagnosticSection(severity: string, entries: DiagnosticEntry[]): void {
    if (!this.getDiagnosticVisibility(severity)) { return }
    const section = entries.filter(entry => severityOf(entry.item) == severity)
    if (section.length == 0) { return }
    const count = section.reduce((sum, entry) => sum + entry.count, 0)
    const details = this.diagnosticsEl.createEl("details", { cls: `sl-diag-section is-${severity}` })
    // Kept across renders so a re-parse does not snap an open section shut.
    details.open = this.sectionOpen[severity] ?? false
    details.addEventListener("toggle", () => { this.sectionOpen[severity] = details.open })
    details.createEl("summary", { text: `${count} ${severity}(s)` })
    const listEl = details.createEl("div", { cls: "sl-diag-list" })
    section.forEach(entry => this.renderDiagnosticItem(listEl, entry.item, entry.count))
  }

  // Sorts by severity and collapses repeated findings into one entry carrying
  // the repetition count.
  private collapseDiagnostics(diagnostics: Diagnostics): DiagnosticEntry[] {
    const groupsById = this.collectDiagnosticGroups(diagnostics)
    const renderedGroups = new Set<string>()
    const entries: DiagnosticEntry[] = []
    sortDiagnostics(diagnostics.items).forEach(item => {
      const group = item.id != undefined ? groupsById.get(item.id) : undefined
      if (group != undefined) {
        const key = String(group.code ?? "")
        if (renderedGroups.has(key)) { return }
        renderedGroups.add(key)
      }
      entries.push({ item, count: group?.count ?? 1 })
    })
    return entries
  }

  // The three toggles in the control row. Redrawn on every render so the
  // Developer button can carry the current `hidden` count.
  private renderDiagnosticToggles(): void {
    if (this.diagToggleEl == undefined) { return }
    this.diagToggleEl.empty()
    this.createDiagnosticToggle(this.diagToggleEl, "defect", "Defects")
    this.createDiagnosticToggle(this.diagToggleEl, "suspect", "Warnings")
    // `summary` counts the complete finding set, `hidden` is what the audience
    // filter withheld - so the button can name the number it would pull in.
    const hidden = this.currDiagnostics.summary.hidden
    const developerLabel = hidden > 0 && this.currAudience != requestAudience_Developer
      ? `Developer (${hidden})`
      : "Developer"
    this.createDiagnosticToggle(this.diagToggleEl, "developer", developerLabel)
  }

  // Button that shows/hides one finding class. The state lives in the global
  // settings, so it survives a restart and is editable there as well.
  private createDiagnosticToggle(container: HTMLElement, kind: string, label: string): void {
    const visible = this.getDiagnosticVisibility(kind)
    const button = new ButtonComponent(container)
      .setButtonText(label)
      .setTooltip(visible ? `Hide ${kind} findings` : `Show ${kind} findings`)
      .onClick(() => { void this.toggleDiagnosticVisibility(kind) })
    button.buttonEl.addClass("sl-diag-toggle")
    button.buttonEl.setAttr("data-sl-test", `diagnostic-toggle-${kind}`)
    button.buttonEl.toggleClass("is-off", !visible)
  }

  private getDiagnosticVisibility(kind: string): boolean {
    const settings = this.slComm?.slPlugin?.settings
    // Without settings the severity sections show, developer findings do not.
    if (settings == undefined) { return kind != "developer" }
    if (kind == "defect") { return settings.showDiagnosticDefects !== false }
    if (kind == "suspect") { return settings.showDiagnosticWarnings !== false }
    if (kind == "developer") { return settings.showDiagnosticDeveloper === true }
    return true
  }

  private async toggleDiagnosticVisibility(kind: string): Promise<void> {
    const plugin = this.slComm?.slPlugin
    if (plugin == undefined) { return }
    const visible = this.getDiagnosticVisibility(kind)
    if (kind == "defect" || kind == "suspect") {
      if (kind == "defect") {
        plugin.settings.showDiagnosticDefects = !visible
      } else {
        plugin.settings.showDiagnosticWarnings = !visible
      }
      // Switching a section on shows what it contains right away.
      if (!visible) { this.sectionOpen[kind] = true }
      await plugin.saveSettings()
      this.renderDiagnostics()
      return
    }
    // Developer findings are not withheld locally - the server never sent them.
    // Switching the audience means asking again.
    plugin.settings.showDiagnosticDeveloper = !visible
    await plugin.saveSettings()
    await this.reloadDiagnosticsForAudience(!visible)
  }

  // Lets the settings tab open a section the same way the view buttons do.
  public expandDiagnosticSection(severity: string): void {
    this.sectionOpen[severity] = true
  }

  // Lets the settings tab redraw the panel after changing the toggles there.
  public refreshDiagnostics(): void {
    if (this.diagnosticsEl == undefined) { return }
    this.renderDiagnostics()
  }

  // Maps finding id -> group for repeated findings. `groups` only exists when
  // findings carry a `code`, and a group of one needs no collapsing.
  private collectDiagnosticGroups(diagnostics: Diagnostics): Map<string, { code?: string; count: number }> {
    const byId = new Map<string, { code?: string; count: number }>()
    diagnostics.groups?.forEach(group => {
      const count = group.count ?? 0
      if (count < 2 || !Array.isArray(group.ids)) { return }
      group.ids.forEach(id => byId.set(id, { code: group.code, count }))
    })
    return byId
  }

  private renderDiagnosticItem(container: HTMLElement, item: Diagnostic, count: number): void {
    const severity = severityOf(item)
    const row = container.createEl("div", { cls: `sl-diag-item is-${severity}` })
    if (String(item.audience ?? "") == requestAudience_Developer) {
      row.addClass("is-developer")
    }
    row.createEl("span", { text: severity, cls: "sl-diag-severity" })
    const body = row.createEl("span", { cls: "sl-diag-body" })
    const message = diagnosticMessage(item)
    body.createEl("span", { text: count > 1 ? `${message} (${count}x)` : message, cls: "sl-diag-message" })
    // `subject`, `code` and `origin` are optional enrichment - never required.
    const symbol = item.subject?.symbol
    if (symbol != undefined && symbol != "") {
      body.createEl("span", { text: symbol, cls: "sl-diag-symbol" })
    }
    if (item.code != undefined && item.code != "") {
      row.setAttr("title", item.code)
    }
    if (item.origin != undefined) {
      body.createEl("div", { text: this.formatOrigin(item.origin), cls: "sl-diag-origin" })
    }
  }

  private formatOrigin(origin: { package?: string; file?: string; func?: string; line?: number }): string {
    const location = [origin.package, origin.file, origin.func].filter(part => part != undefined && part != "").join(" / ")
    return origin.line != undefined ? `${location}:${origin.line}` : location
  }

  private formatDiagnosticsSummary(summary: DiagnosticsSummaryLike, total: number): string {
    if (total == 0) { return "No findings" }
    const parts: string[] = []
    if (summary.blocking > 0) { parts.push(`${summary.blocking} blocking`) }
    if (summary.defect > 0) { parts.push(`${summary.defect} defect`) }
    if (summary.suspect > 0) { parts.push(`${summary.suspect} suspect`) }
    if (summary.note > 0) { parts.push(`${summary.note} note`) }
    return parts.join(" · ")
  }

  // The audience every parse asks for. Findings withheld by the server are not
  // in the reply at all, so this has to be part of the request, not a filter.
  private getRequestAudience(): string {
    return this.getDiagnosticVisibility("developer") ? requestAudience_Developer : requestAudience_User
  }

  // Repeats the last parse with the currently selected audience, so switching
  // the Developer button pulls in (or drops) the technical findings.
  // `expandArrivals` opens the sections the newly arrived findings landed in.
  public async reloadDiagnosticsForAudience(expandArrivals: boolean = false): Promise<void> {
    const last = this.lastParseRequest
    const audience = this.getRequestAudience()
    if (last == undefined) {
      this.currAudience = audience
      this.refreshDiagnostics()
      return
    }
    try {
      const result = await this.performParse(last, audience)
      this.currDiagnostics = result.diagnostics
      this.currAudience = audience
      if (expandArrivals) { this.expandDeveloperSections() }
      this.renderDiagnostics()
    } catch (e) {
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Diagnostics reload failed: ${String(e)}`)
    }
  }

  // Developer findings carry their own severity, so they land spread over the
  // severity sections. Open the ones that actually received something.
  private expandDeveloperSections(): void {
    this.currDiagnostics.items.forEach(item => {
      if (String(item.audience ?? "") == requestAudience_Developer) {
        this.sectionOpen[severityOf(item)] = true
      }
    })
  }

  // Performs the request and decodes the envelope. One decoder for 2xx and 4xx:
  // the reason for a rejected request is in `diagnostics`, not in the status.
  private async performParse(request: LastParseRequest, audience: string): Promise<SemaLogicParseResult> {
    const semaLogicJsonRequestBody = this.createSemaLogicRequestBody(request.dialectID, request.bodytext, request.outPutFormat, request.interpreteText)
    const semaLogicRequest = this.createSemaLogicRequest(request.settings, withAudience(request.vAPI_URL, audience), semaLogicJsonRequestBody, request.engine)
    const response = await requestUrl(semaLogicRequest)
    const raw = response.text ?? ""
    const rulesout = parseRulesout(raw)
    return {
      status: response.status,
      raw,
      rulesout,
      payload: extractRulesout(rulesout, raw),
      diagnostics: normalizeDiagnostics(rulesout?.diagnostics)
    }
  }

  // Full result of one parse: raw body, extracted payload and diagnostics.
  // Callers that only need the payload use getSemaLogicParse below.
  public async requestSemaLogicParse(settings: SemaLogicPluginSettings, vAPI_URL: string, dialectID: string, bodytext: string, parseOnTheFly: boolean, parsingFormat?: string, interpreteText?: string, engine?: string): Promise<SemaLogicParseResult> {
    this.bodytext = bodytext
    this.apiURL = vAPI_URL
    this.dialectID = dialectID

    const outPutFormat = parsingFormat !== undefined ? parsingFormat : this.getOutPutFormat()
    const request: LastParseRequest = { settings, vAPI_URL, dialectID, bodytext, outPutFormat, interpreteText, engine }
    this.lastParseRequest = request

    const audience = this.getRequestAudience()
    let result: SemaLogicParseResult
    try {
      result = await this.performParse(request, audience)
    } catch (e) {
      // Transport failure - there is no envelope to read.
      const errorText = e instanceof Error ? e.toString() : String(e)
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, `Request failed: ${vAPI_URL}`)
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, errorText)
      const text = new DocumentFragment()
      text.createEl("p", { text: errorText })
      text.createEl("p", { text: "See for information about the error-code of http: https://de.wikipedia.org/wiki/HTTP-Statuscode " })
      text.createEl("p", { text: vAPI_URL })
      this.showError(text)
      throw e
    }

    slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, "SemaLogic: Parse with http-status " + result.status.toString())
    slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, `Parseresult:${result.raw}`)

    if (!parseOnTheFly) {
      this.currDiagnostics = result.diagnostics
      this.currAudience = audience
    }

    if (result.status >= 200 && result.status < 300) {
      // This is deliberately written only after the HTTP request completed. It
      // gives the Obsidian UI test a stable proof that a dropdown change did
      // trigger a new request, rather than merely redisplaying an old result.
      this.contentEl.setAttr('data-sl-test-last-request', outPutFormat)
      this.contentEl.setAttr('data-sl-test-last-request-status', result.status.toString())
      if ((this.debugInline == false) && (parseOnTheFly == false)) {
        this.currResult = result.payload.content
        this.currKind = result.payload.kind
        this.currFragment = result.payload.fragment
        this.currSource = result.payload.source
        this.currFormat = result.payload.format
        if (this.currFormat != undefined) {
          slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview,
            `Result format: ${this.currFormat} (mediaType ${result.payload.mediaType ?? "-"})`)
        }
      }
      if (!parseOnTheFly) {
        this.updateView()
      }
      return result
    }

    // Error path: same envelope, `rules` is null and `rulesettype` is absent.
    const messages = result.diagnostics.items.map(item => diagnosticMessage(item)).filter(message => message.length > 0)
    const reason = messages.length > 0 ? messages.join(" | ") : result.raw.trim()
    const detailedMessage = reason.length > 0
      ? `Request failed, status ${result.status}: ${reason}`
      : `Request failed, status ${result.status}`
    slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `[SemaLogic] parse failed: status=${result.status} url=${vAPI_URL} reason=${reason}`)
    if (!parseOnTheFly) {
      this.renderDiagnostics()
    }
    const text = new DocumentFragment()
    text.createEl("p", { text: `Request failed, status ${result.status}` })
    if (messages.length > 0) {
      text.createEl("p", { text: "SemaLogic diagnostics:" })
      messages.forEach(message => text.createEl("p", { text: message }))
    } else {
      text.createEl("p", { text: "Server response:" })
      text.createEl("p", { text: result.raw.length > 0 ? result.raw : "<empty response body>" })
    }
    text.createEl("p", { text: "See for information about the error-code of http: https://de.wikipedia.org/wiki/HTTP-Statuscode " })
    text.createEl("p", { text: vAPI_URL })
    this.showError(text)
    throw new Error(detailedMessage)
  }

  public async getSemaLogicParse(settings: SemaLogicPluginSettings, vAPI_URL: string, dialectID: string, bodytext: string, parseOnTheFly: boolean, parsingFormat?: string, interpreteText?: string, engine?: string): Promise<string> {
    const result = await this.requestSemaLogicParse(settings, vAPI_URL, dialectID, bodytext, parseOnTheFly, parsingFormat, interpreteText, engine)
    return result.payload.content
  }
}

type DiagnosticsSummaryLike = { blocking: number; defect: number; suspect: number; note: number }

// One rendered row: the finding plus how often it occurred (via diagnostics.groups).
type DiagnosticEntry = { item: Diagnostic; count: number }

function severityOf(item: Diagnostic): string {
  return String(item.severity ?? "note")
}

// Cuts the XML prolog and leading comments so the markup can be nested inside
// another <svg> element.
function stripXmlProlog(content: string): string {
  const start = content.indexOf("<svg")
  return start > 0 ? content.substring(start) : content
}



