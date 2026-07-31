import { DropdownComponent, ItemView, WorkspaceLeaf, ButtonComponent, RequestUrlParam, requestUrl, sanitizeHTMLToDom } from "obsidian";
import { slTexts, DebugLevMap, RulesettypesCommands, Rstypes_Semalogic, Rstypes_SemanticTree, Rstypes_KnowledgeGraph, Rstypes_Picture, Rstypes_ASP, DialectGen_Label, API_Defaults } from "./const"
import { SemaLogicPluginComm, DebugLevel, SemaLogicPluginSettings } from "../main"
import { slconsolelog } from './utils'
import { ViewUtils } from "./view_utils";
import { getHostPort } from "./utils";

export const SemaLogicViewType = "SemaLogicService";

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

type DialectEnginePayload = {
  rulesettype?: string
  rules?: {
    contentType?: string
    engine?: string
    output?: string
  }
}

// Progress snapshot delivered by GET /rules/progress. The server reports it for
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
  debugContent: string[]
  zoomIn!: ButtonComponent
  zoomRatio!: ButtonComponent
  zoomOut!: ButtonComponent
  slComm!: SemaLogicPluginComm
  scaleRatio: number
  currResult: string = ""
  bodytext: string = ""
  apiURL: string = ""
  dialectID: string = ""
  headerEl!: HTMLElement
  controlsEl!: HTMLElement
  scaleControlsEl!: HTMLElement
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
    if (this.headerEl == undefined || this.controlsEl == undefined || this.resultEl == undefined) {
      this.setNewInitial(this.getOutPutFormat(), false)
    }
    this.updateScaleControls(this.getOutPutFormat())
    if (this.errorEl != undefined) {
      this.errorEl.empty()
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

  copyToCb() {
    const blobcontentText = (cont: string) => `${cont}`

    let data =
      new ClipboardItem({
        "text/plain": new Blob([blobcontentText(this.currResult)], {
          type: "text/plain"
        })
      })

    navigator.clipboard.write([data])
      .then(() => {
        alert("successfully copied");
      })
      .catch(() => {
        alert("something went wrong");
      });
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
      .addOption(DialectGen_Label, DialectGen_Label)
      .setValue(dropDownValue)
      .onChange(async (value) => {
        slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, 'Set ViewOutputFormat: ' + value);
        this.slComm.slPlugin.updateOutstanding = true
        dropDownValue = value
        this.dropdownButton.setValue(value)
        this.updateScaleControls(value)
        if (value == DialectGen_Label) {
          // Marker state set when a dialect engine was invoked (via button/menu);
          // there is no live re-parse for this entry.
          console.log('[SL-Dialect] dropdown set to DialectEngine (marker, no re-parse)')
          this.showDialectEngineHint()
          return
        }
        if (value == RulesettypesCommands[Rstypes_KnowledgeGraph][1]) {
          await this.slComm.slPlugin.activateKnowledgeView()
        }

        const responseForView = this.getSemaLogicParse(this.slComm.slPlugin.settings, this.apiURL, this.dialectID, this.bodytext, false, value)
        if (value == RulesettypesCommands[Rstypes_KnowledgeGraph][1]) {
          responseForView.then(result => {
            this.slComm.slPlugin.updateKnowledgeCanvas(result)
          })
        }
        //this.updateView()
      })
    return container
  }
  createCopyToClipboardButton(container: HTMLElement): HTMLElement {
    this.copyButton = new ButtonComponent(container)
      .setButtonText('Copy to Clipboard')
      .onClick((mouse_event: MouseEvent) => {
        this.copyToCb()
      })
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
    if (outputFormat == RulesettypesCommands[Rstypes_Picture][1]) {
      this.createScaleButtons(this.scaleControlsEl)
    }
  }

  public setNewInitial(dropDownValue: string, now: boolean) {
    if (!this.checkContainerContent() || now || this.headerEl == undefined) {
      this.contentEl.empty()
      this.headerEl = this.contentEl.createEl("h4", { text: slTexts['HeaderSL'] })
      this.controlsEl = this.contentEl.createEl("div")
      this.scaleControlsEl = this.controlsEl.createEl("span")
      this.errorEl = this.contentEl.createEl("div", { cls: "semalogic-error" })
      this.resultEl = this.contentEl.createEl("div")

      this.createDropDownButtonForOutPutFormat(this.controlsEl, dropDownValue)
      this.createCopyToClipboardButton(this.controlsEl)
      this.createDebugButton(this.controlsEl)
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
      "rulesettype": outPutFormat
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
    if (this.getOutPutFormat() == RulesettypesCommands[Rstypes_Picture][1]) {
      // Zoom for Picture
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

  private getDialectEngineHtml(content: string): string {
    const payload = this.tryParseDialectEnginePayload(content)
    if (payload?.rules?.output != undefined) {
      return this.repairUtf8Mojibake(payload.rules.output)
    }
    return this.repairUtf8Mojibake(content)
  }

  private tryParseDialectEnginePayload(content: string): DialectEnginePayload | undefined {
    try {
      const parsed = JSON.parse(content) as DialectEnginePayload
      if (parsed?.rulesettype == "DialectEngine" || typeof parsed?.rules?.output == "string") {
        return parsed
      }
    } catch (e) {
      slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `DialectEngine response is not JSON: ${String(e)}`)
    }
    return undefined
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
    if (this.getOutPutFormat() == DialectGen_Label) {
      return this.getDialectEngineHtml(this.currResult)
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
    } else {
      if (this.getOutPutFormat() == RulesettypesCommands[Rstypes_ASP][1]) {
        let resulttextarray = this.getCurrResult().split('\n')
        resulttextarray.forEach(value => {
          const textline = responseContent.createEl("span", { text: value + "\n", cls: "debuginline" })
          // textline.style.cssText = 'white-space: pre;' //; white-space: pre-line;'
        })
      } else {
        responseContent.createEl("p", { text: " " })
        responseContent.after(sanitizeHTMLToDom(this.getCurrResult()))
      }
    }
    //return responseContent
  }

  updateView(): void {
    if (this.headerEl == undefined || this.controlsEl == undefined || this.resultEl == undefined) {
      this.setNewInitial(this.getOutPutFormat(), false)
    }
    this.updateScaleControls(this.getOutPutFormat())
    if (this.errorEl != undefined) {
      this.errorEl.empty()
    }
    if (this.resultEl != undefined) {
      this.resultEl.empty()
    }
    this.getCurrHTML()
  }

  public async getSemaLogicParse(settings: SemaLogicPluginSettings, vAPI_URL: string, dialectID: string, bodytext: string, parseOnTheFly: boolean, parsingFormat?: string, interpreteText?: string, engine?: string): Promise<string> {
    this.bodytext = bodytext
    this.apiURL = vAPI_URL
    this.dialectID = dialectID
    let outPutFormat: string
    let resulthttp: string

    if (parsingFormat !== undefined) { outPutFormat = parsingFormat } else { outPutFormat = this.getOutPutFormat() }
    let semaLogicJsonRequestBody = this.createSemaLogicRequestBody(dialectID, bodytext, outPutFormat, interpreteText)
    let semaLogicRequest = this.createSemaLogicRequest(settings, vAPI_URL, semaLogicJsonRequestBody, engine)

    try {
      const response = await requestUrl(semaLogicRequest)

      slconsolelog(DebugLevMap.DebugLevel_High, this.slComm.slview, "SemaLogic: Parse with http-status " + response.status.toString())
      if (response.status == 200) {
        resulthttp = response.text;
        slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, `Parseresult:${resulthttp}`)
        if ((this.debugInline == false) && (parseOnTheFly == false)) {
          this.currResult = resulthttp
        }
        if (!parseOnTheFly) {
          this.updateView()
        }
      } else {
        // Surface the server's error body (e.g. the reason for a 422) instead of a bare status.
        const serverBody = response.text?.trim() ?? ""
        const detailedMessage = serverBody.length > 0
          ? `Request failed, status ${response.status}: ${serverBody}`
          : `Request failed, status ${response.status}`
        console.log(`[SemaLogic] parse failed: status=${response.status} url=${semaLogicRequest.url} body=${serverBody}`)
        let text = new DocumentFragment()
        text.createEl("p", { text: `Request failed, status ${response.status}` })
        text.createEl("p", { text: "Server response:" })
        text.createEl("p", { text: serverBody.length > 0 ? serverBody : "<empty response body>" })
        text.createEl("p", { text: "See for information about the error-code of http: https://de.wikipedia.org/wiki/HTTP-Statuscode " })
        text.createEl("p", { text: semaLogicRequest.url })
        text.createEl("p", { text: String(semaLogicRequest.body) })
        this.showError(text)
        throw new Error(detailedMessage)
      }

      if (this.slComm.slaspview != undefined) {
        //this.slComm.slaspview.aspParse(this.slComm, settings, this.getSemaLogicText())
      }

      return new Promise<string>((resolve) => {
        resolve(resulthttp);
      });
    }
    catch (e) {
      const errorText = e instanceof Error ? e.toString() : String(e)
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, `Request failed: ${semaLogicRequest.url}`)
      slconsolelog(DebugLevMap.DebugLevel_High, this.slComm.slview, `Catcherror of removing context ${vAPI_URL}`)
      slconsolelog(DebugLevMap.DebugLevel_High, this.slComm.slview, errorText)
      if (e instanceof Error && e.message.startsWith("Request failed, status ")) {
        throw e
      }
      let text = new DocumentFragment()
      text.createEl("p", { text: errorText })
      text.createEl("p", { text: "See for information about the error-code of http: https://de.wikipedia.org/wiki/HTTP-Statuscode " })
      text.createEl("p", { text: semaLogicRequest.url })
      text.createEl("p", { text: String(semaLogicRequest.body) })
      this.showError(text)
      throw e
    }
  }
}



