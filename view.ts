import { DropdownComponent, ItemView, WorkspaceLeaf, ButtonComponent, RequestUrlParam, requestUrl } from "obsidian";
import { slTexts, rulesettypesCommands, rstypes_Semalogic, rstypes_Picture, rstypes_ASP, rstypes_SemanticTree, DebugLevMap } from "./const"
import { SemaLogicPluginComm, DebugLevel, SemaLogicPluginSettings } from "./main"
import { slconsolelog } from './utils'
import { ViewUtils } from "./view_utils";

export const SemaLogicViewType = "SemaLogicService";

export class SemaLogicView extends ItemView {
  view_utils: ViewUtils
  myAction: HTMLElement
  dropdownButton: DropdownComponent
  copyButton: ButtonComponent
  debugButton: ButtonComponent
  debugContent: string[]
  zoomIn: ButtonComponent
  zoomRatio: ButtonComponent
  zoomOut: ButtonComponent
  slComm: SemaLogicPluginComm
  scaleRatio: number
  currResult: string
  bodytext: string
  apiURL: string
  dialectID: string

  public debugInline: boolean

  public getOutPutFormat(): string {
    return this.dropdownButton.getValue()
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
  }

  public setComm(comm: SemaLogicPluginComm) {
    if (this.slComm != comm) {
      this.slComm = comm
      //this.slComm.setSlView(this)
      this.setNewInitial(this.slComm.slPlugin.settings.mySLSettings[this.slComm.slPlugin.settings.mySetting].myOutputFormat)
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
      .addOption(rulesettypesCommands[rstypes_Semalogic][1], rulesettypesCommands[rstypes_Semalogic][0])
      .addOption(rulesettypesCommands[rstypes_ASP][1], rulesettypesCommands[rstypes_ASP][0])
      .addOption(rulesettypesCommands[rstypes_Picture][1], rulesettypesCommands[rstypes_Picture][0])
      .addOption(rulesettypesCommands[rstypes_SemanticTree][1], rulesettypesCommands[rstypes_SemanticTree][0])
      .setValue(dropDownValue)
      .onChange(async (value) => {
        if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { slconsolelog(this.slComm.slview, 'Set ViewOutputFormat: ' + value); }
        this.slComm.slPlugin.updateOutstanding = true
        dropDownValue = value
        this.dropdownButton.setValue(value)
        this.getSemaLogicParse(this.slComm.slPlugin.settings, this.apiURL, this.dialectID, this.bodytext, false, value)
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
            if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { slconsolelog(this.slComm.slview, 'Set InlineDebugging: ' + this.debugInline); }
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
        if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { slconsolelog(this.slComm.slview, 'Set ScaleRatio to: ' + this.scaleRatio); }
        this.updateView()
      })

    this.zoomRatio = new ButtonComponent(container)
      .setButtonText(String(this.scaleRatio))
      .onClick((mouse_event: MouseEvent) => {
        if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { slconsolelog(this.slComm.slview, 'ScaleRatio := ' + this.scaleRatio); }
      })

    this.zoomOut = new ButtonComponent(container)
      .setButtonText('+')
      .onClick((mouse_event: MouseEvent) => {
        this.scaleRatio = this.scaleRatio * 2
        this.zoomRatio.setButtonText(String(this.scaleRatio))
        if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { slconsolelog(this.slComm.slview, 'Set ScaleRatio to: ' + this.scaleRatio); }
        this.updateView()
      })

    return container
  }

  checkContainerContent(): boolean {
    if (this.containerEl.children != undefined) {
      if (this.containerEl.children[1].textContent == slTexts['HeaderSL']) {
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


  public setNewInitial(dropDownValue: string) {
    let container = this.contentEl
    if (!this.checkContainerContent()) {
      container.empty()
      //container.contentEditable = 'true'
      container.createEl("h4", { text: slTexts['HeaderSL'] });

      container = this.createDropDownButtonForOutPutFormat(container, dropDownValue)
      container = this.createCopyToClipboardButton(container)
      container = this.createDebugButton(container)
      if (dropDownValue == rulesettypesCommands[rstypes_Picture][1]) {
        container = this.createScaleButtons(container)
      }
      container.createEl("p")
    } else {
      this.deleteContainerContent()
    }
  }

  async onOpen() {
    this.setNewInitial(rulesettypesCommands[rstypes_Semalogic][1])
    // this.containerEl.children[1].appendText("let's begin");
  }

  async onClose() {
    // Nothing to clean up.
  }

  showError(fragment: DocumentFragment) {
    //   this.setInitial(rulesettypesCommands[rstypes_Semalogic][1])
    this.contentEl.appendChild(fragment)
  }
  onunload(): void {

    if (this.slComm.slPlugin != undefined) {
      this.slComm.slPlugin.activated = false
      this.slComm.slPlugin.myStatus.setText('SemaLogic is off');
    }

  }

  createSemaLogicRequestBody(dialectID: string, bodytext: string, outPutFormat: string): any {
    if (DebugLevel >= DebugLevMap.DebugLevel_Important) { slconsolelog(this.slComm.slview, 'Context: ' + dialectID + ' Bodytext: ' + bodytext) }
    let semaLogicJsonRequestBody = {
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
    return semaLogicJsonRequestBody
  }

  createSemaLogicRequest(settings: SemaLogicPluginSettings, vAPI_URL: string, semaLogicJsonRequestBody: any): RequestUrlParam {
    let request: RequestUrlParam = {
      url: vAPI_URL,
      method: 'POST',
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(semaLogicJsonRequestBody)
    }

    if (settings.mySLSettings[settings.mySetting].myUseHttps && settings.mySLSettings[settings.mySetting].myUser != '') {
      request = {
        url: vAPI_URL,
        method: 'POST',
        headers: {
          "content-type": "application/json",
          "Authorization": "Basic " + btoa(settings.mySLSettings[settings.mySetting].myUser + ":" + settings.mySLSettings[settings.mySetting].myPassword)
        },
        body: JSON.stringify(semaLogicJsonRequestBody)
      }
    }
    if (DebugLevel >= DebugLevMap.DebugLevel_Important) {
      slconsolelog(this.slComm.slview, 'Parsingsstring')
      slconsolelog(this.slComm.slview, request)
    }
    return request
  }

  getRequestEmbed(content: string): string {
    if (this.getOutPutFormat() == rulesettypesCommands[rstypes_Picture][1]) {
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

  getCurrResult(): string {
    return this.getRequestEmbed(this.currResult)
  }

  getCurrHTML(): void {
    let responseContent = this.contentEl.createEl('div');

    if (this.debugInline == true) {
      this.debugContent.forEach(value => {
        const textline = responseContent.createEl("span", { text: value + "\n" })
        textline.style.cssText = 'white-space: pre;' //; white-space: pre-line;'
      })
    } else {
      if (this.getOutPutFormat() == rulesettypesCommands[rstypes_ASP][1]) {
        let resulttextarray = this.getCurrResult().split('\n')
        resulttextarray.forEach(value => {
          const textline = responseContent.createEl("span", { text: value + "\n" })
          textline.style.cssText = 'white-space: pre;' //; white-space: pre-line;'
        })
      } else {
        responseContent.createEl("p", { text: " " })
        let div = document.createElement('div');
        // Add some HTML content to the div 
        div.innerHTML = this.getCurrResult();
        // Append the div to the document body
        responseContent.appendChild(div);
      }
    }
    //return responseContent
  }

  updateView(): void {
    this.setNewInitial(this.getOutPutFormat())
    this.getCurrHTML()
  }

  public async getSemaLogicParse(settings: SemaLogicPluginSettings, vAPI_URL: string, dialectID: string, bodytext: string, parseOnTheFly: boolean, parsingFormat?: string): Promise<string> {
    this.bodytext = bodytext
    this.apiURL = vAPI_URL
    this.dialectID = dialectID
    let outPutFormat: string
    if (parsingFormat !== undefined) { outPutFormat = parsingFormat } else { outPutFormat = this.getOutPutFormat() }
    let semaLogicJsonRequestBody = this.createSemaLogicRequestBody(dialectID, bodytext, outPutFormat)
    let semaLogicRequest = this.createSemaLogicRequest(settings, vAPI_URL, semaLogicJsonRequestBody)

    try {
      const response = await requestUrl(semaLogicRequest)

      if (DebugLevel >= DebugLevMap.DebugLevel_High) { slconsolelog(this.slComm.slview, "SemaLogic: Parse with http-status " + response.status.toString()) };
      if (response.status == 200) {
        var resulthttp = response.text;
        if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) { slconsolelog(this.slComm.slview, `Parseresult:${resulthttp}`) }
        if ((this.debugInline == false) && (parseOnTheFly == false)) {
          this.currResult = resulthttp
        }
        if (!parseOnTheFly) {
          this.updateView()
        }
      }

      if (this.slComm.slaspview != undefined) {
        //this.slComm.slaspview.aspParse(this.slComm, settings, this.getSemaLogicText())
      }

      return new Promise<string>((resolve) => {
        resolve(resulthttp);
      });
    }
    catch (e) {
      if (DebugLevel >= DebugLevMap.DebugLevel_High) { slconsolelog(this.slComm.slview, `Catcherror of removing context ${vAPI_URL}`) }
      if (DebugLevel >= DebugLevMap.DebugLevel_High) { slconsolelog(this.slComm.slview, e.toString()) }
      let text = new DocumentFragment()
      text.createEl("p")
      let textfragment = (new Range()).createContextualFragment(e.toString());
      text.appendChild(textfragment)
      text.createEl("p")
      textfragment = (new Range()).createContextualFragment("See for information about the error-code of http: https://de.wikipedia.org/wiki/HTTP-Statuscode ");
      text.append(textfragment)
      text.createEl("p")
      textfragment = (new Range()).createContextualFragment(semaLogicRequest.url);
      text.append(textfragment)
      text.createEl("p")
      textfragment = (new Range()).createContextualFragment(String(semaLogicRequest.body));
      text.append(textfragment)
      this.showError(text)
      throw e
    }
  }
}



