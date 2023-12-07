import { MarkdownRenderChild, MarkdownView } from 'obsidian';
import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { DebugLevel, SemaLogicPluginSettings } from "../main";
import { API_Defaults, semaLogicCommand, semaLogicHelp, rulesettypesCommands, DebugLevelNames, DebugLevMap, rstypes_ASP, rstypes_Semalogic } from "./const"
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

    for (let rule in rulesettypesCommands) {
      // search for the rulessettype which is to show inline
      if (semaLogicCom.contains(rulesettypesCommands[rule][0])) {
        rulesettype = rulesettypesCommands[rule][1]
        // search for a given filter
        const findfor = semaLogicCom.indexOf(semaLogicCommand.showFilter)
        if (findfor > 0) {
          let filter = semaLogicCom.substring(findfor + semaLogicCommand.showFilter.length)
          filter = filter.trim()
        }
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

  if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { console.log(semaLogicCommand.showHelp); }

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

  if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { console.log(semaLogicCommand.showVersion); }

  const version = await semaLogicGetVersion(settings)
    .then(function (resultBuffer: any) {
      versiontext = resultBuffer;
    })
    .catch(function (resultBuffer: any) { versiontext = resultBuffer; }
    )
  if (DebugLevel >= DebugLevMap.DebugLevel_High) { console.log(`JSON-Text in Processor:${versiontext}`) }

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

  if (DebugLevel >= DebugLevMap.DebugLevel_Informative) { console.log(semaLogicCommand.showHelp); }


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
  let adress = sethttps(settings.mySLSettings[settings.mySetting].myUseHttps)
  adress = adress + settings.mySLSettings[settings.mySetting].myBaseURL

  if (settings.mySLSettings[settings.mySetting].myPort != '') {
    adress = adress + ':' + settings.mySLSettings[settings.mySetting].myPort
  }
  if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) { console.log('getting SemaLogic-Adress: ' + adress) }
  return adress
}

export function getHostAspPort(settings: SemaLogicPluginSettings, parsedCommands: parseCommand): string {
  let adress: string
  if (parsedCommands.outputformat == rulesettypesCommands[rstypes_ASP][1]) {
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
  if (parsedCommands.param != undefined) { adress = adress + "?" + parsedCommands.param }
  if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) { console.log('getting asp-Adress: ' + adress) }
  return adress
}

export async function semaLogicGetVersion(settings: SemaLogicPluginSettings): Promise<string> {

  if (DebugLevel >= DebugLevMap.DebugLevel_Important) { console.log("Start semaLogicGetVersion") }

  // Prepare JSON-Format
  const myVersion = '{"version":"0","versiontext":"Text"}';
  let myJson = JSON.parse(myVersion);
  let jsonVersion: string = "";

  // Create Url for Get Version
  let vAPI_URL_Version = getHostPort(settings) + API_Defaults.Version;
  if (DebugLevel >= DebugLevMap.DebugLevel_Important) { console.log(vAPI_URL_Version) }

  let options: RequestUrlParam

  if (settings.mySLSettings[settings.mySetting].myUseHttps && settings.mySLSettings[settings.mySetting].myUser != '') {
    options = {
      url: vAPI_URL_Version,
      method: 'GET',
      headers: {
        "content-type": "application/json",
        "Authorization": "Basic " + btoa(settings.mySLSettings[settings.mySetting].myUser + ":" + settings.mySLSettings[settings.mySetting].myPassword)
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
    if (DebugLevel >= DebugLevMap.DebugLevel_All) { console.log(myJson.version) }
    jsonVersion = myJson.version;
    if (DebugLevel >= DebugLevMap.DebugLevel_All) { console.log(`JSON-Text in Request:${jsonVersion}`) }
    return jsonVersion;
  }
  catch (e) {
    console.log('Error: Catch of APIVersion' + e.toString())
    throw new Error()
    //return 'Error: Catch of APIVersion'
  }
}

// semaLogicPing tries to test standardVersionAPI - if it can't be connected - show meaningful error state
export async function semaLogicPing(settings: SemaLogicPluginSettings, lastUpdate: number): Promise<boolean> {
  let starttime = Date.now()
  if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) { console.log('GetVersionPing at ', Date.now(), '  for ', getHostPort(settings)) }
  await semaLogicGetVersion(settings)
    .then(function (resultBuffer: any) {
      // nothing to do
      if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) { console.log('SemaLogic GetVersionPing started at:', starttime, ' Endtime: ', Date.now()) }
    })
    .catch(function (e: Error) {
      // If it is an old error (long time ago sent), then tehere is nothing to do
      if (starttime < lastUpdate) {
        // time to show an error 
        if (DebugLevel >= DebugLevMap.DebugLevel_Important) {
          console.log(`There is no connection to SemaLogicService APIVersion`)
          console.log(getHostPort(settings))
        }
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
        if (DebugLevel >= DebugLevMap.DebugLevel_High) { console.log('SemaLogic GetVersionPing failed and not used started:', starttime, ' Endtime: ', Date.now()) }
      }
    }
    )
  return true
}

// ToDo: Parse ist durch den aktuellen Umbau im PreProcessor nochmal anzupassen
async function showParseWithFilter(filter: string, rulessettype: string, settings: SemaLogicPluginSettings): Promise<Node[]> {
  // ToDo: Change from console-log to slconsolelog with SLcom-Object
  let results: Node[] = [];
  let buildcontainerEl: HTMLElement;

  let vAPI_URL = getHostPort(settings) + API_Defaults.rules_parse + "?sid=" + settings.mySLSettings[settings.mySetting].mySID;
  if (DebugLevel >= DebugLevMap.DebugLevel_Important) { console.log(vAPI_URL) };

  let bodytext: string = "";

  let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView == undefined) {
    if (DebugLevel >= DebugLevMap.DebugLevel_High) { console.log("Do not find an active view") }
    return results
  }

  let dialectID: string = "default"

  let codeblock: boolean = false;
  let newCodeblock: boolean = false;

  if (activeView != null) {
    for (let i = 0; i < activeView.editor.lineCount(); i++) {
      if (DebugLevel >= DebugLevMap.DebugLevel_All) {
        console.log(i, ';', activeView.editor.getLine(i))
        console.log('Substring:', activeView.editor.getLine(i).substring(0, 2));
      }
      if (activeView.editor.getLine(i).substring(0, 3) == "```") {
        if (!codeblock) {
          codeblock = true
          newCodeblock = true
        } else {
          newCodeblock = false
        }

      }
      if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) { console.log('Current line is Codeblock', codeblock) }

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
    var optionsParse: RequestUrlParam = {
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
    var optionsParse: RequestUrlParam = {
      url: vAPI_URL,
      method: 'POST',
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(jsontestwthFilter)
    }
  }

  let res: string;
  if (DebugLevel >= DebugLevMap.DebugLevel_Chatty) {
    console.log(`Context: ${dialectID}, Bodytext: ${bodytext}`)
  }

  if (DebugLevel >= DebugLevMap.DebugLevel_Important) { console.log(optionsParse) }
  try {
    const responseParse = await requestUrl(optionsParse)
    const remJson = responseParse.text;
    if (DebugLevel >= DebugLevMap.DebugLevel_Important) { console.log("SemaLogic: Parse with http-status " + responseParse.status.toString()) };
    if (responseParse.status == 200) {
      let resulthttp = responseParse.text;
      const fragment = (new Range()).createContextualFragment(resulthttp);
      //buildcontainerEl = createEl("h4", { text: API_Defaults.viewheader });
      buildcontainerEl = createEl("p")
      buildcontainerEl.appendChild(fragment);
      results.push(buildcontainerEl)
      if (DebugLevel >= DebugLevMap.DebugLevel_Important) {
        console.log(`Parseresult:${resulthttp}`);
      }
      return results
    }
  }
  catch (e) {
    slconsolelog(undefined, `Catcherror of removing context ${vAPI_URL}`)
    //console.log(`Catcherror of removing context ${vAPI_URL}`)
    slconsolelog(undefined, e.toString())
    //console.log(e.toString())
    throw e
  }

  return results
}

export function slconsolelog(slview?: SemaLogicView | undefined, message?: any, ...optionalParams: any[]) {

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

