// ToDo (Prio 3): Getting Default-API-URL by API-Description
export const API_Defaults = {
	http: "http://",
	https: "https://",
	Base_URL: "localhost",
	Port: "28000",
	rules_parse: "/rules/parse",
	reset: "/reset",
	Version: "/APIVersion",
	PostDialect: "/dialect/define",
	RemoveDialect: "/dialect/remove",
	GetAPI: "/APIVersion",
	SID: "12345678",
	ShowContext: true,
	useUserPasswortforHTTP: false,
	HttpUser: "User",
	HttpPassword: "Password",
	viewheader: "SemaLogicView",
	AspUrl: "studyregulation-stage.cavas.uni-potsdam.de/",
	AspEndpoint: "/plans/count"

}

export const Value_Defaults = {
	updateInterval: 500
}


// ToDo: Optimierung der Speicherung von Befehlen in Array und späteren Case-Aufruf und Aufteilung in Unterfunktionen
export var semaLogicCommand = {
	command_start: "SemaLogic(",
	command_end: ")",
	showHelp: "show help",
	showVersion: "show version",
	getDialectwTemplate: "template", // ToDo: Get Template muss wie Version and Help auch außerhalb des Codeblocks funktionieren
	useDialect: "use ???dialectName???",
	define: "define", // Define is not for obsidian - it is for defining SemaLogic-Interpretation
	showParse: "show as",
	showFilter: "for",
	transfer: "transfer",
	transferEndpoint: "to endpoint",
	transferParam: "with param"
}

export var symtoken = "SymToken"

export const semaLogicHelp: string[][] = [
	[semaLogicCommand.command_start + "???" + semaLogicCommand.command_end, "You can define what SemaLogic should do for you by replacing ??? with one of the following SemaLogic commands:"],
	[semaLogicCommand.command_start + semaLogicCommand.showHelp + semaLogicCommand.command_end, "Show this help information"],
	[semaLogicCommand.command_start + semaLogicCommand.showVersion + semaLogicCommand.command_end, "Show the version of the SemaLogic-Service"],
	[semaLogicCommand.command_start + semaLogicCommand.define + semaLogicCommand.command_end, "After this inlinecommand and a space line comes e.g. a table that should be interpreted by SemaLogic (table, NTable, ZTable) with optional headerinterpretation- Expected format:\n(|Symbol||Level(n+1)|\n|---|---|\n|Level(1)|Level(n)|Value|)"],
	[`${semaLogicCommand.command_start + semaLogicCommand.showParse} %1 ${semaLogicCommand.showFilter} %2 ${semaLogicCommand.command_end}`, "show as - shows an output directly to the reading view ( with %1 you have to set the output type: 1|1 {picture, syemalogic, asp} and with %2 you could filter for an symbol by symbolname)"],
	[`${semaLogicCommand.command_start + semaLogicCommand.transfer} %1 ${semaLogicCommand.transferEndpoint} %2 ${semaLogicCommand.transferParam} %3 ${semaLogicCommand.command_end}`, "transfer - shows an (currently only) asp output directly to the asp.view from SemaLogicView ( with %1 you have to set the output type: 1|1 {asp} and with %2 you could set the endpoint and wuth %3 you could set queryparameter)"],
]

// rulesettype : type, Naming
export const rstypes_Semalogic = 0
export const rstypes_Picture = 3
export const rstypes_ASP = 6
export const rstypes_SemanticTree = 8

export const rulesettypesCommands: string[][] = [
	["SemaLogic", "SemaLogic"],
	["technical", "SemaLogic"],
	["semalogic", "SemaLogic"],
	["Picture (SVG)", "SVG"],
	["picture", "SVG"],
	["SVG", "SVG"],
	["ASP", "ASP.json"],
	["asp", "ASP.json"],
	["SemanticTree", "SemanticTree"],
]

export const DebugLevelNames: string[] =
	['DebugLevel_Off',
		'DebugLevel_Current_Dev',
		'DebugLevel_Important',
		'DebugLevel_Informative',
		'DebugLevel_Chatty',
		'DebugLevel_All'
	]


export const DebugLevMap: DebugLevel_I = {
	'DebugLevel_Off': 0,
	'DebugLevel_Current_Dev': 1,
	'DebugLevel_Important': 2,
	'DebugLevel_Informative': 3,
	'DebugLevel_Chatty': 4,
	'DebugLevel_All': 5
}

interface DebugLevel_I {
	[Levelname: string]: number
}

type MapType = {
	[id: string]: string;
}

export const slTexts: MapType = {
	"HeaderSL": "SemaLogic.View"
}