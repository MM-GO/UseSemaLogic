import { ItemView, WorkspaceLeaf, RequestUrlParam, requestUrl } from "obsidian";
import { DebugLevMap, semaLogicCommand, Rstypes_ASP, RulesettypesCommands, slTexts } from "./const"
import { SemaLogicPluginComm, SemaLogicPluginSettings } from "../main"
import { getHostAspPort, slconsolelog } from './utils'
import { parseCommands } from "src/view_utils";


export const ASPViewType = 'TransferService';

export class ASPView extends ItemView {

  myAction: HTMLElement
  LastRequestTime: number = 0
  slComm: SemaLogicPluginComm

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.navigation = true
    this.setNewASPInitial(true)
  }

  public setComm(comm: SemaLogicPluginComm) {
    this.slComm = comm
    //this.slComm.setSlView(this)
    this.setNewASPInitial(false)
  }

  getViewType() {
    return ASPViewType;
  }

  getDisplayText() {
    return ASPViewType;
  }

  onload(): void {
    this.navigation = true
    this.contentEl.contentEditable = 'true'
  }

  checkASPContainerContent(): boolean {
    if (this.containerEl.children != undefined) {
      if (this.containerEl.children[1].textContent?.substring(0, slTexts['HeaderTV'].length) == slTexts['HeaderTV']) {
        return true
      } else {
        return false
      }
    } else {
      return false
    }
  }

  deleteASPContainerContent(): void {
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

  public setNewASPInitial(now: boolean) {
    //const container = this.contentEl
    //container.empty()
    //container.createEl("h4", { text: "Transfer.View" });
    //container.createEl("p")
    let container = this.contentEl
    if (now || !this.checkASPContainerContent()) {
      container.empty()
      //container.contentEditable = 'true'
      container.createEl("h4", { text: slTexts['HeaderTV'] });
      container.createEl("p")
    } else {
      //this.deleteASPContainerContent()
    }
  }



  async onOpen() {
    //this.setNewASPInitial()
  }

  async onClose() {
    // Nothing to clean up.
  }

  showError(fragment: DocumentFragment) {
    //   this.setInitial(rulesettypesCommands[rstypes_Semalogic][1])
    this.contentEl.appendChild(fragment)
  }
  onunload(): void {
    if (this.slComm != undefined) {
      this.slComm.slPlugin.activated = false
      this.slComm.slPlugin.myStatus.setText('Transfer is off');
    }
  }

  createRequest(comm: SemaLogicPluginComm, settings: SemaLogicPluginSettings, apiUrl: string, method: string, contentType: string, withBasicAuth: boolean, body?: string): RequestUrlParam {
    let request: RequestUrlParam
    type requestHeader = Record<string, string>
    let myHeader: requestHeader = {}

    contentType = contentType.toLowerCase()
    method = method.toUpperCase()

    switch (contentType.toLowerCase()) {
      case ("json"): {
        myHeader["Content-Type"] = "application/json"
        break;
      }
      case ("asp"): {
        myHeader["Content-Type"] = "application/json"
        break;
      }
      case ("asp.json"): {
        myHeader["Content-Type"] = "application/json"
        break;
      }
      case ("text"): {
        myHeader["Content-Type"] = "text/plain"
        break
      }
      default: {
        myHeader["Content-Type"] = contentType
        break
      }
    }

    if (withBasicAuth) {
      myHeader["Authorization"] = "Basic " + btoa(settings.mySLSettings[settings.mySetting].myUser + ":" + settings.mySLSettings[settings.mySetting].myPassword)
    }

    request = {
      url: apiUrl,
      method: method,
      headers: myHeader,
      body: body
    }
    slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, request)
    return request
  }

  getASPCommands(slComm: SemaLogicPluginComm, settings: SemaLogicPluginSettings): parseCommands {
    let parseCommands: parseCommands
    parseCommands = {
      commands: [{
        outputformat: "ASP.json",
        endpoint: settings.mySLSettings[settings.mySetting].myAspEndpoint,
        param: ""
      }]
    }
    let parseInitial = true

    if (slComm.slview != null) {

      const editortext = slComm.slUsedMDView.editor.getRange({ line: 0, ch: 0 }, { line: slComm.slUsedMDView.editor.lastLine() + 1, ch: slComm.slUsedMDView.editor.lastLine.length })
      const rows = editortext.split("\n").filter((row) => row.length > 0);

      let myStrResult: string;
      let transferString: string;
      let endpointString: string = '';
      let paramString: string;

      rows.forEach(row => {
        if (row.substring(0, semaLogicCommand.command_start.length) == semaLogicCommand.command_start) {
          const transfer = row.indexOf(semaLogicCommand.transfer)
          const endpoint = row.indexOf(semaLogicCommand.transferEndpoint)
          let param = row.indexOf(semaLogicCommand.transferParam)
          const endCommand = row.lastIndexOf(semaLogicCommand.command_end)
          if (param < 0) { param = endCommand }

          if (transfer <= 0) { } else {
            transferString = row.substring(transfer + semaLogicCommand.transfer.length + 1, endpoint)
            transferString = transferString.trimEnd()
            if (endpoint > 0) {
              endpointString = row.substring(endpoint + 1 + semaLogicCommand.transferEndpoint.length, param)
              endpointString = endpointString.trimEnd()
            }
            if (param > 0 && param != endCommand) {
              paramString = row.substring(param + 1 + semaLogicCommand.transferParam.length, endCommand)
              paramString = paramString.trimEnd()
            }

            let paramParsedCommand = {
              outputformat: transferString,
              endpoint: endpointString,
              param: paramString
            }
            if (parseInitial) {
              parseInitial = false
              parseCommands.commands[0] = paramParsedCommand
            } else {
              parseCommands.commands.push(paramParsedCommand)
            }
          }
        }
      })
    }
    return parseCommands
  }

  public async aspParse(slComm: SemaLogicPluginComm, settings: SemaLogicPluginSettings, aspJsonParsedSemaLogic: string, RequestTime: Number) {
    slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Start Transfer_Parse')
    //this.setNewASPInitial()

    let vAPI_URL: string = ""
    const parseCommands = this.getASPCommands(slComm, settings)

    parseCommands.commands.forEach(parseCommands => {

      if (parseCommands.outputformat == RulesettypesCommands[Rstypes_ASP][1] || parseCommands.outputformat == RulesettypesCommands[Rstypes_ASP][0]) {
        vAPI_URL = getHostAspPort(settings, parseCommands)
      } else {
        vAPI_URL = parseCommands.endpoint
        if (parseCommands.param != undefined) {
          if (parseCommands.param.length > 0) { vAPI_URL = vAPI_URL + "?" + parseCommands.param }
        }
        slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, "Transfer URL: ", vAPI_URL)
      }

      let optionsParse = this.createRequest(this.slComm, settings, vAPI_URL, 'POST', 'json', true, aspJsonParsedSemaLogic)
      this.Resp(optionsParse, vAPI_URL, RequestTime)
    })
  }

  public async Resp(optionsParse: RequestUrlParam, vAPI_URL: string, RequestTime: Number) {
    try {
      slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, "ASP: want to parse ", optionsParse)
      const responseParse = await requestUrl(optionsParse)
      const remJson = responseParse.text;
      slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, "ASP: Parse with http-status " + responseParse.status.toString())
      if (responseParse.status == 200) {
        if (this.slComm.slaspview.LastRequestTime == RequestTime) {
          let resulthttp = responseParse.text;
          this.setNewASPInitial(true)
          this.contentEl.createEl("br")
          this.contentEl.createEl("span", "---------------------------------------------------------")
          this.contentEl.createEl("br")
          // temporary pretty print for not formatted json-output - will be changed in rel 2.x
          resulthttp = resulthttp.replaceAll("[", "[\n")
          resulthttp = resulthttp.replaceAll("]", "\n]")
          resulthttp = resulthttp.replaceAll(",", ",\n")
          let resulthttpArray = resulthttp.split('\n')
          resulthttpArray.forEach(element => {
            this.contentEl.append(element)
            this.contentEl.createEl("br")
          });
          slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, `ASP-Parseresult:${resulthttp}`)
        } else {
          slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, `Old_ASP-Request: ${RequestTime} vs ${this.slComm.slaspview.LastRequestTime}`)
        }
      }
    }
    catch (e) {
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, `Catcherror of removing context ${vAPI_URL}`)
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, e.toString())

      let text = new DocumentFragment()
      text.createEl("p")
      let textfragment = (new Range()).createContextualFragment(e.toString());
      text.appendChild(textfragment)

      text.createEl("p")
      textfragment = (new Range()).createContextualFragment("See for information about the error-code of http: https://de.wikipedia.org/wiki/HTTP-Statuscode ");
      text.append(textfragment)

      text.createEl("p")
      textfragment = (new Range()).createContextualFragment(optionsParse.url);
      text.append(textfragment)

      text.createEl("p")
      textfragment = (new Range()).createContextualFragment(String(optionsParse.body));
      text.append(textfragment)
      this.contentEl.empty()
      this.contentEl.createEl("br")
      this.contentEl.append(text)
    }

  }

}











