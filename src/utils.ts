import { MarkdownRenderChild, MarkdownView, Notice } from 'obsidian';
import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { DebugLevel, SemaLogicPluginSettings, mygSID } from "../main";
import { API_Defaults, semaLogicCommand, semaLogicHelp, DebugLevMap, RulesettypesCommands, Rstypes_ASP } from "./const"
import { SemaLogicView, SemaLogicViewType } from "./view";
import { parseCommand } from 'src/view_utils';

export const searchForSemaLogicCommands = (el: Element): boolean => {
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (isSemaLogicCommand(child)) {
      return true;
    }
  }
  return false;
};

export const isSemaLogicCommand = (n: Node): boolean =>
  n.nodeType === Node.TEXT_NODE && Boolean(n.textContent?.startsWith(semaLogicCommand.command_start));

let lastVersionNoticeKey: string | undefined


// check if the node has to be replaced must be do before 
export const replaceWithEmptyNode = (containerEl: HTMLElement): Node[] => {
  const results: Node[] = [];
  return results
};

export async function replaceWithCommandNode(containerEl: HTMLElement, settings: SemaLogicPluginSettings): Promise<Node[]> {
  let results: Node[] = []
  let found: boolean = false

  let semaLogicCom = containerEl.textContent?.substring(semaLogicCommand.command_start.length, containerEl.textContent?.indexOf(semaLogicCommand.command_end)).toLowerCase()

  if ((!found) && ((semaLogicCom?.toString().substring(0, semaLogicCommand.showHelp.length)) == semaLogicCommand.showHelp)) {//semaLogicCommand.showHelp.toLowerCase())) {
    // Make table with help-Array
    results = await showHelp()
    found = true
  }

  if ((!found) && ((semaLogicCom?.toString().substring(0, semaLogicCommand.showVersion.length)) == semaLogicCommand.showVersion)) {// semaLogicCommand.showVersion.toLowerCase())) {
    results = await showVersion(settings)
    found = true
  }

  if ((!found) && ((semaLogicCom?.toString().substring(0, semaLogicCommand.showParse.length)) == semaLogicCommand.showParse)) {// semaLogicCommand.showParse.toLowerCase())) {
    // search for rulessettype
    let rulesettype: string = "" // so far as there is no outputformat - nothing to do
    let filter: string = ""

    for (let rule in RulesettypesCommands) {
      // search for the rulessettype which is to show inline
      if (semaLogicCom.contains(RulesettypesCommands[rule][0])) {
        rulesettype = RulesettypesCommands[rule][1]
        // search for a given filter
        const findfor = semaLogicCom.indexOf(semaLogicCommand.showFilter)
        if (findfor > 0) {
          filter = semaLogicCom.substring(findfor + semaLogicCommand.showFilter.length)
          filter = filter.trim()
        }
        found = true
        break
      }
    }

    if (!found) { // Default
      // Make table with help-Array
      results = await showHelp()
      found = true
    }


    if (rulesettype != "") {
      results = await showParseWithFilter(filter, rulesettype, settings)
    }
    found = true
  }

  if (!found) {
    results = replaceWithEmptyNode(containerEl)
  }

  return results
}

export class SemaLogicRenderedElement extends MarkdownRenderChild {
  mysettings: SemaLogicPluginSettings;

  constructor({ containerEl, set }: { containerEl: HTMLElement, set: SemaLogicPluginSettings }) {
    super(containerEl);
    this.mysettings = set
  }
  async onload(): Promise<void> {
    this.containerEl.setChildrenInPlace(
      await replaceWithCommandNode(this.containerEl, this.mysettings)
      //replaceWithEmptyNode(this.containerEl)
    );
  }
}

async function showHelp(): Promise<Node[]> {
  let results: Node[] = [];
  let buildcontainerEl: HTMLElement;

  slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, semaLogicCommand.showHelp)

  buildcontainerEl = createEl('table');
  let body = buildcontainerEl.createEl("body");
  let row = body.createEl("tr");
  row.createEl("td", { text: "SemaLogic-Commands-Help" });
  row.createEl("td", { text: "Description" });
  for (let i = 0; i < semaLogicHelp.length; i++) {
    const row = body.createEl("tr");
    row.createEl("td", { text: semaLogicHelp[i][0] });
    row.createEl("td", { text: semaLogicHelp[i][1] });
  }

  results.push(buildcontainerEl);
  return results;
}

async function showVersion(settings: SemaLogicPluginSettings): Promise<Node[]> {
  let results: Node[] = [];
  let buildcontainerEl: HTMLElement;
  let versiontext: string = "";

  slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, semaLogicCommand.showVersion)

  const version = await semaLogicGetVersion(settings)
    .then(function (resultBuffer: any) {
      versiontext = resultBuffer;
    })
    .catch(function (resultBuffer: any) { versiontext = resultBuffer; }
    )
  slconsolelog(DebugLevMap.DebugLevel_High, undefined, `JSON-Text in Processor:${versiontext}`)

  // Version is shown in a table line
  buildcontainerEl = createEl('table');
  const table = buildcontainerEl.createEl('table');
  const body = buildcontainerEl.createEl("body");
  const row = body.createEl("tr");
  row.createEl("td", { text: versiontext });

  results.push(buildcontainerEl);
  return results;
}

async function showParseSVG(Filter: string): Promise<Node[]> {
  let results: Node[] = [];
  let buildcontainerEl: HTMLElement;

  slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, semaLogicCommand.showHelp);

  buildcontainerEl = createEl('table');
  let body = buildcontainerEl.createEl("body");
  let row = body.createEl("tr");
  row.createEl("td", { text: "SemaLogic-Commands-Help" });
  row.createEl("td", { text: "Description" });
  for (let i = 0; i < semaLogicHelp.length; i++) {
    const row = body.createEl("tr");
    row.createEl("td", { text: semaLogicHelp[i][0] });
    row.createEl("td", { text: semaLogicHelp[i][1] });
  }

  results.push(buildcontainerEl);
  return results;
}

function sethttps(https: boolean): string {
  let str: string
  // https ?
  if (https) {
    str = API_Defaults.https
  } else {
    str = API_Defaults.http
  }
  return str
}

export function getHostPort(settings: SemaLogicPluginSettings): string {
  let adress = sethttps(settings.mySLSettings[settings.mySetting].myUseHttpsSL)
  adress = adress + settings.mySLSettings[settings.mySetting].myBaseURL

  if (settings.mySLSettings[settings.mySetting].myPort != '') {
    adress = adress + ':' + settings.mySLSettings[settings.mySetting].myPort
  }
  slconsolelog(DebugLevMap.DebugLevel_High, undefined, 'getting SemaLogic-Adress: ' + adress)
  return adress
}

export function getHostAspPort(settings: SemaLogicPluginSettings, parsedCommands: parseCommand): string {
  let adress: string
  if (parsedCommands.outputformat == RulesettypesCommands[Rstypes_ASP][1]) {
    adress = sethttps(settings.mySLSettings[settings.mySetting].myUseHttps)
    adress = adress + settings.mySLSettings[settings.mySetting].myAspUrl
    if (parsedCommands.endpoint != undefined) {
      if (parsedCommands.endpoint.indexOf("http") >= 0) {
        adress = parsedCommands.endpoint
      } else {
        adress = adress + "/" + parsedCommands.endpoint
      }
    }
  } else {
    // undefinded new transfer endpoint
    adress = parsedCommands.endpoint
  }
  if ((parsedCommands.param != undefined) && (parsedCommands.param != '')) { adress = adress + "?" + parsedCommands.param }
  slconsolelog(DebugLevMap.DebugLevel_High, undefined, 'getting asp-Adress: ' + adress)
  return adress
}

export async function semaLogicGetVersion(settings: SemaLogicPluginSettings): Promise<string> {

  slconsolelog(DebugLevMap.DebugLevel_Important, undefined, "Start semaLogicGetVersion")

  // Prepare JSON-Format
  const myVersion = '{"version":"0","versiontext":"Text"}';
  let myJson = JSON.parse(myVersion);
  let jsonVersion: string = "";

  // Create Url for Get Version
  let vAPI_URL_Version = getHostPort(settings) + API_Defaults.Version;
  slconsolelog(DebugLevMap.DebugLevel_Important, undefined, vAPI_URL_Version)

  let options: RequestUrlParam

  if (settings.mySLSettings[settings.mySetting].myUseHttpsSL && settings.mySLSettings[settings.mySetting].myUserSL != '') {
    options = {
      url: vAPI_URL_Version,
      method: 'GET',
      headers: {
        "content-type": "application/json",
        "Authorization": "Basic " + btoa(settings.mySLSettings[settings.mySetting].myUserSL + ":" + settings.mySLSettings[settings.mySetting].myPasswordSL)
      },
    }
  } else {
    options = {
      url: vAPI_URL_Version,
      method: 'GET',
    }
  }
  let response: RequestUrlResponse;

  // Get information about version from the request 
  try {
    response = await requestUrl(options)
    myJson = JSON.parse(response.text);
    slconsolelog(DebugLevMap.DebugLevel_All, undefined, myJson.version)
    jsonVersion = myJson.version;
    slconsolelog(DebugLevMap.DebugLevel_All, undefined, `JSON-Text in Request:${jsonVersion}`)
    return jsonVersion;
  }
  catch (e) {
    slconsolelog(DebugLevMap.DebugLevel_Error, undefined, 'Error: Catch of APIVersion' + e.toString())
    throw new Error()
  }
}

// semaLogicPing tries to test standardVersionAPI - if it can't be connected - show meaningful error state
export async function semaLogicPing(settings: SemaLogicPluginSettings, lastUpdate: number): Promise<boolean> {
  let starttime = Date.now()
  slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, 'GetVersionPing at ', Date.now(), '  for ', getHostPort(settings))
  await semaLogicGetVersion(settings)
    .then(function (resultBuffer: any) {
      // nothing to do
      slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, 'SemaLogic GetVersionPing started at:', starttime, ' Endtime: ', Date.now())
      const noticeKey = getHostPort(settings)
      if (noticeKey != lastVersionNoticeKey) {
        lastVersionNoticeKey = noticeKey
        const ok = isApiVersionAtLeast(resultBuffer, "00.02.00")
        if (!ok) {
          new Notice("UseSemaLogic requires a SemaLogic Service API version 00.02.00 or higher.")
        }
      }
    })
    .catch(function (e: Error) {
      // If it is an old error (long time ago sent), then tehere is nothing to do
      if (starttime < lastUpdate) {
        // time to show an error 
        slconsolelog(DebugLevMap.DebugLevel_Important, undefined, `There is no connection to SemaLogicService APIVersion`)
        slconsolelog(DebugLevMap.DebugLevel_Important, undefined, getHostPort(settings))
        app.workspace.iterateAllLeaves((leaf: any) => {
          let slView = leaf.view.getViewType()
          if (slView == SemaLogicViewType) {
            const container = leaf.view.containerEl.children[1];
            container.empty();
            container.createEl("h3", { text: "SemaLogic_Error" });
            container.createEl("b", { text: "There is no connection to SemaLogicService -> APIVersion" });
            container.createEl("b", { text: getHostPort(settings) });
            return false
          }
        })
      } else {
        slconsolelog(DebugLevMap.DebugLevel_High, undefined, 'SemaLogic GetVersionPing failed and not used started:', starttime, ' Endtime: ', Date.now())
      }
    }
    )
  return true
}

function isApiVersionAtLeast(versionText: string, minVersion: string): boolean {
  if (!versionText) { return false }
  const extract = (v: string): number[] => {
    const m = v.match(/(\d{2})\.(\d{2})\.(\d{2})/)
    if (!m) { return [] }
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  }
  const a = extract(versionText)
  const b = extract(minVersion)
  if (a.length !== 3 || b.length !== 3) { return false }
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) { return true }
    if (a[i] < b[i]) { return false }
  }
  return true
}

// ToDo: Parse ist durch den aktuellen Umbau im PreProcessor nochmal anzupassen
async function showParseWithFilter(filter: string, rulessettype: string, settings: SemaLogicPluginSettings): Promise<Node[]> {
  // ToDo: Change from console-log to slconsolelog with SLcom-Object
  let results: Node[] = [];
  let buildcontainerEl: HTMLElement;

  //let vAPI_URL = getHostPort(settings) + API_Defaults.rules_parse + "?sid=" + settings.mySLSettings[settings.mySetting].mySID;
  let vAPI_URL = getHostPort(settings) + API_Defaults.rules_parse + "?sid=" + mygSID;
  slconsolelog(DebugLevMap.DebugLevel_Important, undefined, vAPI_URL)
  let bodytext: string = "";

  let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView == undefined) {
    slconsolelog(DebugLevMap.DebugLevel_High, undefined, "Do not find an active view")
    return results
  }

  let dialectID: string = "default"

  let codeblock: boolean = false;
  let newCodeblock: boolean = false;

  if (activeView != null) {
    for (let i = 0; i < activeView.editor.lineCount(); i++) {
      slconsolelog(DebugLevMap.DebugLevel_All, undefined, i, ';', activeView.editor.getLine(i))
      slconsolelog(DebugLevMap.DebugLevel_All, undefined, 'Substring:', activeView.editor.getLine(i).substring(0, 2));
      if (activeView.editor.getLine(i).substring(0, 3) == "```") {
        if (!codeblock) {
          codeblock = true
          newCodeblock = true
        } else {
          newCodeblock = false
        }

      }
      slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, 'Current line is Codeblock', codeblock)

      if ((!codeblock) && (!newCodeblock)) {
        // Check inline Statements
        switch (activeView.editor.getLine(i)) {
          default: bodytext = bodytext.concat(activeView.editor.getLine(i) + '\n')
        }
      }
      else {
        // Prüfe auf zu verwendenden Dialect
        switch (activeView.editor.getLine(i).substring(0, semaLogicCommand.useDialect.length)) {
          case semaLogicCommand.useDialect: {
            dialectID = activeView.editor.getLine(i).substring(semaLogicCommand.useDialect.length, activeView.editor.getLine(i).length - 1)
            dialectID = dialectID.trim();
            break
          }
          default: { }
        }

      }
      if (i < activeView.editor.lineCount()) {
        if (activeView.editor.getLine(i).substring(0, 3) == "```") {
          if ((codeblock) && (!newCodeblock)) { codeblock = false } else { newCodeblock = false }
        }
      }
    }
  }



  if (bodytext == "") { bodytext = "" }
  if (dialectID == "") { dialectID = "default" }
  let result = "";
  let optionsParse: RequestUrlParam;

  if (filter != "") {
    let jsonwoFilter = {
      "text": [
        {
          "textID": "fly",
          "dialectID": dialectID,
          "rules": bodytext
        }
      ],
      "filter": {
        "dialectID": "default",
        "symbols": [
          {
            "symbol": filter
          }
        ]
      },
      "persistency": false,
      "rulesettype": rulessettype //settings.myOutputFormat
    }
    optionsParse = {
      url: vAPI_URL,
      method: 'POST',
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(jsonwoFilter)
    }
  } else {
    let jsontestwthFilter = {
      "text": [
        {
          "textID": "fly",
          "dialectID": dialectID,
          "rules": bodytext
        }
      ],
      "filter": {},
      "persistency": false,
      "rulesettype": rulessettype //settings.myOutputFormat
    }
    optionsParse = {
      url: vAPI_URL,
      method: 'POST',
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(jsontestwthFilter)
    }
  }

  let res: string;
  slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, `Context: ${dialectID}, Bodytext: ${bodytext}`)
  slconsolelog(DebugLevMap.DebugLevel_Important, undefined, optionsParse)
  try {
    const responseParse = await requestUrl(optionsParse)
    const remJson = responseParse.text;
    slconsolelog(DebugLevMap.DebugLevel_Important, undefined, "SemaLogic: Parse with http-status " + responseParse.status.toString())
    if (responseParse.status == 200) {
      let resulthttp = responseParse.text;
      const fragment = (new Range()).createContextualFragment(resulthttp);
      //buildcontainerEl = createEl("h4", { text: API_Defaults.viewheader });
      buildcontainerEl = createEl("p")
      buildcontainerEl.appendChild(fragment);
      results.push(buildcontainerEl)
      slconsolelog(DebugLevMap.DebugLevel_Important, undefined, `Parseresult:${resulthttp}`);
      return results
    }
  }
  catch (e) {
    slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `Catcherror of removing context ${vAPI_URL}`)
    //console.log(`Catcherror of removing context ${vAPI_URL}`)
    slconsolelog(DebugLevMap.DebugLevel_Error, undefined, e.toString())
    //console.log(e.toString())
    throw e
  }

  return results
}

export function slconsolelog(DebugValue: number, slview?: SemaLogicView | undefined, message?: any, ...optionalParams: any[]) {
  if (DebugLevel >= DebugValue) {
    if (slview != undefined) {
      if (slview.getViewType() == SemaLogicViewType) {
        if (slview.getDebugInline() == true) {
          let logMessages = JSON.stringify(message)
          slview.appendDebugContent(logMessages)
        } else { console.log(message, ...optionalParams) }
      }
    } else {
      console.log(message, ...optionalParams)
    }
  }
}


