import { App, MarkdownView, Plugin, PluginSettingTab, requestUrl, Setting, WorkspaceLeaf, renderResults, RequestUrlParam, RequestUrlResponse, RequestUrlResponsePromise, ButtonComponent, MarkdownRenderChild, MarkdownPreviewView, View, TFile, normalizePath, MarkdownRenderer, setIcon, Platform, Notice, Modal, TextComponent }
	from 'obsidian';
import { SemaLogicView, SemaLogicViewType } from "./src/view";
import { ASPView, ASPViewType } from "./src/view_asp";
import { ViewUpdate, EditorView } from "@codemirror/view";
import { SemaLogicRenderedElement, searchForSemaLogicCommands, getHostPort, semaLogicPing, slconsolelog } from "./src/utils";
import { API_Defaults, Value_Defaults, semaLogicCommand, RulesettypesCommands, Rstypes_Semalogic, Rstypes_Picture, Rstypes_ASP, DebugLevMap, DebugLevelNames, Rstypes_KnowledgeGraph, Rstypes_SemanticTree } from "./src/const"
import { ViewUtils } from 'src/view_utils';
import { createTemplateFolder } from 'src/template';
import { createExamples } from 'src/examples';
import { createTestCanvas, createTemplateCanvas } from 'src/test_canvas';
import { slTermHider } from "src/sl_term_hider";
//import { Rstypes_SemanticTree } from 'src/const only for UP';

export var DebugLevel = 0;

export var mygSID = String(Math.round(Math.random() * 99999999999))
const SL_DEBUG_BUILD = "canvas-anchor-debug-2026-04-08-01"

type CanvasNodeInsertType = "AND" | "OR" | "LEAF" | "SYMBOL" | "ATTRIBUTE"
type CanvasEdgeInsertType = "as_Defined" | "as_calculated"

type CanvasFileNode = {
	id: string
	type: string
	text?: string
	x: number
	y: number
	width?: number
	height?: number
	color?: string
	meta?: Record<string, unknown>
}

type CanvasFileEdge = {
	id: string
	fromNode: string
	fromSide: string
	toNode: string
	toSide: string
	color?: string
	meta?: Record<string, unknown>
}

type CanvasFileData = {
	nodes: CanvasFileNode[]
	edges: CanvasFileEdge[]
	files?: unknown[]
}

type CanvasOrConfig = {
	min: string
	max: string
}

type CanvasNodeContentConfig = {
	orConfig?: CanvasOrConfig
	value?: string
}

class CanvasNodeIdModal extends Modal {
	private readonly suggestedId: string
	private readonly nodeType: CanvasNodeInsertType
	private readonly resolveValue: (value: string | undefined) => void
	private inputComponent: TextComponent | undefined

	constructor(app: App, nodeType: CanvasNodeInsertType, suggestedId: string, resolveValue: (value: string | undefined) => void) {
		super(app)
		this.nodeType = nodeType
		this.suggestedId = suggestedId
		this.resolveValue = resolveValue
	}

	onOpen(): void {
		const { contentEl, titleEl } = this
		titleEl.setText(`Insert ${this.nodeType} node`)
		contentEl.empty()

		const setting = new Setting(contentEl)
			.setName("Node ID")
			.setDesc("Enter the node identifier for the new canvas node.")
			.addText((text) => {
				this.inputComponent = text
				text.setValue(this.suggestedId)
				text.inputEl.select()
				text.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key == "Enter") {
						evt.preventDefault()
						this.submit()
					}
				})
			})

		setting.addButton((button) => {
			button.setButtonText("Add")
			button.setCta()
			button.onClick(() => this.submit())
		})
		setting.addExtraButton((button) => {
			button.setIcon("cross")
			button.setTooltip("Cancel")
			button.onClick(() => {
				this.resolveValue(undefined)
				this.close()
			})
		})
	}

	onClose(): void {
		this.contentEl.empty()
	}

	private submit(): void {
		const value = this.inputComponent?.getValue().trim() ?? ""
		this.resolveValue(value.length > 0 ? value : undefined)
		this.close()
	}
}

class CanvasOrConfigModal extends Modal {
	private readonly resolveValue: (value: CanvasOrConfig | undefined) => void
	private minComponent: TextComponent | undefined
	private maxComponent: TextComponent | undefined

	constructor(app: App, resolveValue: (value: CanvasOrConfig | undefined) => void) {
		super(app)
		this.resolveValue = resolveValue
	}

	onOpen(): void {
		const { contentEl, titleEl } = this
		titleEl.setText("Configure OR node")
		contentEl.empty()

		new Setting(contentEl)
			.setName("Min")
			.setDesc("Minimum number of required options.")
			.addText((text) => {
				this.minComponent = text
				text.setValue("1")
			})

		const maxSetting = new Setting(contentEl)
			.setName("Max")
			.setDesc("Maximum number of allowed options.")
			.addText((text) => {
				this.maxComponent = text
				text.setValue("1")
				text.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key == "Enter") {
						evt.preventDefault()
						this.submit()
					}
				})
			})

		maxSetting.addButton((button) => {
			button.setButtonText("Add")
			button.setCta()
			button.onClick(() => this.submit())
		})
		maxSetting.addExtraButton((button) => {
			button.setIcon("cross")
			button.setTooltip("Cancel")
			button.onClick(() => {
				this.resolveValue(undefined)
				this.close()
			})
		})
	}

	onClose(): void {
		this.contentEl.empty()
	}

	private submit(): void {
		const min = this.minComponent?.getValue().trim() ?? ""
		const max = this.maxComponent?.getValue().trim() ?? ""
		if (min.length == 0 || max.length == 0) {
			new Notice("Min and Max are required.")
			return
		}
		this.resolveValue({ min, max })
		this.close()
	}
}

export interface SLSetting {
	myPort: string;
	myOutputFormat: string;
	myBaseURL: string;
	myGetAPI: string;
	mySID: string;
	myContext: boolean;
	myUpdateInterval: number;
	myUseHttps: boolean,
	myUser: string,
	myPassword: string,
	myAspUrl: string,
	myAspEndpoint: string,
	myUseHttpsSL: boolean,
	myUserSL: string,
	myPasswordSL: string
}

export interface SemaLogicPluginSettings {
	mySLSettings: SLSetting[];
	mySetting: number;
	myDebugLevel: number;
	showSelectionActionButtons: boolean;
}
export const Default_profile: SemaLogicPluginSettings = {
	mySLSettings: [{
		myPort: API_Defaults.Port,
		myOutputFormat: 'SemaLogic',
		myBaseURL: API_Defaults.Base_URL,
		myGetAPI: API_Defaults.GetAPI,
		mySID: API_Defaults.SID,
		myContext: API_Defaults.ShowContext,
		myUseHttps: API_Defaults.useUserPasswortforHTTP,
		myUser: API_Defaults.HttpUser,
		myPassword: API_Defaults.HttpPassword,
		myUpdateInterval: Value_Defaults.updateInterval,
		myAspUrl: API_Defaults.AspUrl,
		myAspEndpoint: API_Defaults.AspEndpoint,
		myUseHttpsSL: API_Defaults.useUserPasswortforHTTPSL,
		myUserSL: API_Defaults.HttpUserSL,
		myPasswordSL: API_Defaults.HttpPasswordSL
	},
	{
		myPort: API_Defaults.Port,
		myOutputFormat: 'SemaLogic',
		myBaseURL: API_Defaults.Base_URL,
		myGetAPI: API_Defaults.GetAPI,
		mySID: API_Defaults.SID,
		myContext: API_Defaults.ShowContext,
		myUseHttps: API_Defaults.useUserPasswortforHTTP,
		myUser: API_Defaults.HttpUser,
		myPassword: API_Defaults.HttpPassword,
		myUpdateInterval: Value_Defaults.updateInterval,
		myAspUrl: API_Defaults.AspUrl,
		myAspEndpoint: API_Defaults.AspEndpoint,
		myUseHttpsSL: API_Defaults.useUserPasswortforHTTPSL,
		myUserSL: API_Defaults.HttpUserSL,
		myPasswordSL: API_Defaults.HttpPasswordSL
	},
	{
		myPort: API_Defaults.Port,
		myOutputFormat: 'SemaLogic',
		myBaseURL: API_Defaults.Base_URL,
		myGetAPI: API_Defaults.GetAPI,
		mySID: API_Defaults.SID,
		myContext: API_Defaults.ShowContext,
		myUseHttps: API_Defaults.useUserPasswortforHTTP,
		myUser: API_Defaults.HttpUser,
		myPassword: API_Defaults.HttpPassword,
		myUpdateInterval: Value_Defaults.updateInterval,
		myAspUrl: API_Defaults.AspUrl,
		myAspEndpoint: API_Defaults.AspEndpoint,
		myUseHttpsSL: API_Defaults.useUserPasswortforHTTPSL,
		myUserSL: API_Defaults.HttpUserSL,
		myPasswordSL: API_Defaults.HttpPasswordSL
	},
	],
	mySetting: 0,
	myDebugLevel: 0,
	showSelectionActionButtons: false,
}


const getDebugLevel = (DebugLevelName: string): number => {
	slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, 'Get for DebugLevelName', DebugLevelName)
	DebugLevelNames.forEach((value, index) => {
		if (value == DebugLevelName) {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, 'Find DebugLevelIndex', index)
			return index
		}
	});
	slconsolelog(DebugLevMap.DebugLevel_High, undefined, 'No Finding for DebugLevelName', DebugLevelName)
	return 0
}

// Settings for SemaLogic
class SemaLogicSettingTab extends PluginSettingTab {
	plugin: SemaLogicPlugin;

	constructor(app: App, plugin: SemaLogicPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {

		const { containerEl } = this;
		containerEl.empty();

		// Headline for SettingsTab
		containerEl.createEl('h2', { text: 'Settings for SemaLogic:' });

		// General Debug Level
		new Setting(containerEl)
			.setName('General DebugLevel')
			.setDesc('You can set a DebugLevel for Developmentinformation')
			.addDropdown(dropDown => dropDown
				.addOption('0', DebugLevelNames[0])
				.addOption('1', DebugLevelNames[1])
				.addOption('2', DebugLevelNames[2])
				.addOption('3', DebugLevelNames[3])
				.addOption('4', DebugLevelNames[4])
				.addOption('5', DebugLevelNames[5])
				.setValue(String(this.plugin.settings.myDebugLevel))
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_High, undefined, 'Set DebugLevel: ' + DebugLevelNames[parseInt(value)])
					this.plugin.settings.myDebugLevel = parseInt(value);
					DebugLevel = parseInt(value)
					await this.plugin.saveSettings();
					this.display()
				}));

		// Display Settings for SemaLogic
		new Setting(containerEl)
			.setName('Change your setting profile')
			.setDesc('You can define different profiles for your SemaLogicService')
			.addDropdown(dropDown => dropDown
				.addOption('0', 'Profile 1')
				.addOption('1', 'Profile 2')
				.addOption('2', 'Profile 3')
				.setValue(this.plugin.settings.mySetting.toString())
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_High, undefined, 'Set Profile: ' + value)
					this.plugin.settings.mySetting = parseInt(value);
					this.display();
					await this.plugin.saveSettings();
				}));


		// Show StandardUpdateInterval
		new Setting(containerEl)
			.setName('Standard updateinterval')
			//.setDesc('Set standard updateinterval')
			.addText(setting => setting
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUpdateInterval.toString())
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set Update Interval: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUpdateInterval = parseInt(value);
					window.clearInterval(this.plugin.interval)
					this.plugin.registerInterval(
						this.plugin.interval = 0
					);
					await this.plugin.saveSettings()
					//this.display()
				}));


		// BaseURL 
		new Setting(containerEl)
			.setName('BaseUrl')
			.setDesc('BaseURL for reaching SemaLogicService')
			.addText(text => text
				.setPlaceholder(API_Defaults.Base_URL)
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myBaseURL)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set BaseURL: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myBaseURL = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Path to Get-API-Endpoints')
			.setDesc('Path to Get-API for more Information about the Endpoints of used APIs')
			.addText(text => text
				.setPlaceholder(API_Defaults.GetAPI)
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myGetAPI)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set to Get-API-Endpoint: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myGetAPI = value;
					await this.plugin.saveSettings();
					//this.display()
				}));


		// Port for reaching SemaLogic with Standardparameter
		new Setting(containerEl)
			.setName('Port SemaLogic')
			.setDesc('Enter the Port')
			.addText(text => text
				.setPlaceholder(API_Defaults.Port)
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myPort)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set to Port: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myPort = value;
					await this.plugin.saveSettings();
				}));

		// OutputFormats 
		// ToDo: Get from API which OutputFormats are possible		
		new Setting(containerEl)
			.setName('OutputFormat')
			.setDesc('Here you can set the outputformat for SemaLogic, which could be get from SemaLogicService')
			.addDropdown(dropDown => dropDown
				.addOption(RulesettypesCommands[Rstypes_Semalogic][1], RulesettypesCommands[Rstypes_Semalogic][0])
				.addOption(RulesettypesCommands[Rstypes_ASP][1], RulesettypesCommands[Rstypes_ASP][0])
				.addOption(RulesettypesCommands[Rstypes_Picture][1], RulesettypesCommands[Rstypes_Picture][0])
				.addOption(RulesettypesCommands[Rstypes_SemanticTree][1], RulesettypesCommands[Rstypes_SemanticTree][0])
				.addOption(RulesettypesCommands[Rstypes_KnowledgeGraph][1], RulesettypesCommands[Rstypes_KnowledgeGraph][0])
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myOutputFormat)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set Outputformat: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myOutputFormat = value;
					await this.plugin.saveSettings();
				}));

		/* SID is not needed for on-the-fly-solving in obsidian
				// SID-Information
				new Setting(containerEl)
					.setName('SID')
					.setDesc('SemaLogic SessionID')
					.addText(text => text
						.setPlaceholder(API_Defaults.SID)
						.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].mySID)
						.onChange(async (value) => {
							slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set SID: ' + value)
							this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].mySID = value;
							await this.plugin.saveSettings();
						}));
		*/

		// For HTTP-Request with User/Password for transfer view		
		new Setting(containerEl)
			.setName('Secure HTTP-Request SemaLogic')
			.setDesc('If you has to use User/Password for http-request to the semalogic service')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUseHttpsSL)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set UserPasswordRequest: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUseHttpsSL = value;
					await this.plugin.saveSettings()
					this.display()
				}));

		if (this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUseHttpsSL) {
			// Request-User
			new Setting(containerEl)
				.setName('HTTP-Request-User')
				.setDesc('User to reach transfer service')
				.addText(text => text
					.setPlaceholder(API_Defaults.HttpUserSL)
					.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUserSL)
					.onChange(async (value) => {
						slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set HTTP-Request-User...')
						this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUserSL = value;
						await this.plugin.saveSettings();
					}));

			// Request-Password
			new Setting(containerEl)
				.setName('HTTP-Request-Password')
				.setDesc('Password to reach transfer service')
				.addText(text => text
					.setPlaceholder(API_Defaults.HttpPasswordSL)
					.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myPasswordSL)
					.onChange(async (value) => {
						slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set HTTP-Request-Password...')
						this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myPasswordSL = value;
						await this.plugin.saveSettings();
					}));
		}


		// Show Dialect in Reading View
		new Setting(containerEl)
			.setName('Show Context in Reading View')
			//.setDesc('Show Context in Reading View')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myContext)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set Context of Reading View: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myContext = value;
					await this.plugin.saveSettings()
					//this.display()
				}));

		new Setting(containerEl)
			.setName('Show selection action buttons')
			.setDesc('Display SL-Edit and SL-Interpret buttons for text selections')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.showSelectionActionButtons)
				.onChange(async (value) => {
					this.plugin.settings.showSelectionActionButtons = value;
					await this.plugin.saveSettings()
					this.plugin.updateSelectionActionButtonUi()
				}));

		// Headline for SettingsTab
		containerEl.createEl('h1', { text: '_______________________________' });
		containerEl.createEl('h2', { text: 'Settings for Transfer/ASP-View:' });

		// ASPBaseURL 
		new Setting(containerEl)
			.setName('BaseUrl for Transfer/ASP')
			.setDesc('BaseURL for reaching Transfer/ASP-Service')
			.addText(text => text
				.setPlaceholder(API_Defaults.AspUrl)
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myAspUrl)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set Transfer/ASP-BaseURL: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myAspUrl = value;
					await this.plugin.saveSettings();
				}));

		// Standard ASPEndpoint
		new Setting(containerEl)
			.setName('Path to Get-Transfer/ASP-StandardAPI-Endpoint')
			.setDesc('Path to Transfer/ASP-Standard-API ')
			.addText(text => text
				.setPlaceholder(API_Defaults.AspEndpoint)
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myAspEndpoint)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set to Transfer/ASP-Standard-API-Endpoint: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myAspEndpoint = value;
					await this.plugin.saveSettings();
				}));

		// For HTTP-Request with User/Password for transfer view		
		new Setting(containerEl)
			.setName('Secure HTTP-Request')
			.setDesc('If you has to use User/Password for http-request to the transfer service')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUseHttps)
				.onChange(async (value) => {
					slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set UserPasswordRequest: ' + value)
					this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUseHttps = value;
					await this.plugin.saveSettings()
					this.display()
				}));


		if (this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUseHttps) {
			// Request-User
			new Setting(containerEl)
				.setName('HTTP-Request-User')
				.setDesc('User to reach transfer service')
				.addText(text => text
					.setPlaceholder(API_Defaults.HttpUser)
					.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUser)
					.onChange(async (value) => {
						slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set HTTP-Request-User...')
						this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUser = value;
						await this.plugin.saveSettings();
					}));

			// Request-Password
			new Setting(containerEl)
				.setName('HTTP-Request-Password')
				.setDesc('Password to reach transfer service')
				.addText(text => text
					.setPlaceholder(API_Defaults.HttpPassword)
					.setValue(this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myPassword)
					.onChange(async (value) => {
						slconsolelog(DebugLevMap.DebugLevel_Important, undefined, 'Set HTTP-Request-Password...')
						this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myPassword = value;
						await this.plugin.saveSettings();
					}));
		}


	}
}

// CommunicationClass for interaction between SLview and editor window
export class SemaLogicPluginComm {
	slview: SemaLogicView
	slPlugin: SemaLogicPlugin
	slaspview: ASPView
	activatedASP: boolean = false;
	activatedKnowledge: boolean = false;
	slUsedMDView: MarkdownView

	setSlView(view: SemaLogicView) {
		this.slview = view
	}

	setSLClass(slclass: SemaLogicPlugin) {
		this.slPlugin = slclass
	}

	public add(a: number, b: number): number {
		return a + b
	}
}

export default class SemaLogicPlugin extends Plugin {
	settings: SemaLogicPluginSettings;
	semaLogicView: SemaLogicView;
	myStatus: HTMLElement;
	statusTransfer: boolean = false
	statusSL: boolean = true;
	pluginEnabled: boolean = true;

	activated: boolean = false;
	updating: boolean = false;
	lastUpdate: number = 0;
	updateOutstanding: boolean = false;
	updateTransferOutstanding: boolean = false;
	updateOutstandingSetting: boolean = false;
	waitingForResponse = false;
	UpdateProcessing: boolean = false;
	slComm: SemaLogicPluginComm;
	lastactiveView: MarkdownView;
	view_utils = new ViewUtils
	interval: number
	parseDebounce: number | undefined
	lastParsedHash: string = ""
	canvasTooltipEl: HTMLElement | undefined
	canvasTooltipCleanup: (() => void) | undefined
	canvasTooltipObservers: WeakMap<WorkspaceLeaf, MutationObserver> = new WeakMap()
	interpreterModalEl: HTMLElement | undefined
	interpreterModalCleanup: (() => void) | undefined
	selectionActionPopupEl: HTMLElement | undefined
	selectionActionHideDebounce: number | undefined
	selectionActionUpdateDebounce: number | undefined
	selectionActionHeaderButtons: WeakMap<WorkspaceLeaf, HTMLElement> = new WeakMap()
	canvasNodeFileCache: Map<string, { mtime: number; map: Map<string, string>; textMap: Map<string, string>; dataMap: Map<string, string>; dataTextMap: Map<string, string>; idTextMap: Map<string, string>; dataIdTextMap: Map<string, string> }> = new Map()
	canvasNodeInsertSelections: Map<string, CanvasNodeInsertType> = new Map()
	canvasEdgeModes: Map<string, CanvasEdgeInsertType> = new Map()
	canvasKnownEdgeIds: Map<string, Set<string>> = new Map()
	canvasEdgeModeWriteInFlight: Set<string> = new Set()
	knowledgeCanvasPath: string = "SemaLogic/KnowledgeGraph.canvas"
	knowledgeLastRequestTime: number = 0
	knowledgeLeaf: WorkspaceLeaf | undefined
	knowledgeEditCanvasPath: string = "SemaLogic/KnowledgeEdit.canvas"
	knowledgeEditLeaf: WorkspaceLeaf | undefined
	knowledgeEditInterval: number | undefined
	knowledgeEditLastCanvas: string = ""
	knowledgeEditSelection: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number }; original: string } | undefined
	knowledgeEditDebounce: number | undefined
	interpreterCanvasPath: string = "SemaLogic/SLInterpreter.canvas"
	interpreterLeaf: WorkspaceLeaf | undefined
	interpreterInterval: number | undefined
	interpreterLastCanvas: string = ""
	interpreterSelection: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number }; sourceText: string; original: string } | undefined
	interpreterDebounce: number | undefined
	pauseAllRequests: boolean = false

	// Due to change in Sprint 1/2023 to inline dialects, detection of contexts will be needed in later sprints 
	private getContextFromLine(mydialectID: string) {
		// ToDo: Replace tokens until the new SemaLogic version supports contexts
		mydialectID = mydialectID.replace('SemaLogicContext\u2261', 'SemaLogicDialect\u2261');
		//mydialectID = mydialectID.replace("dialect:=", "");
		let re = /\t/gi;
		mydialectID = mydialectID.replace(re, "");
		re = /\n/gi;
		mydialectID = mydialectID.replace(re, "");
		return { mydialectID };
	}

	private getActiveView(): MarkdownView | undefined {
		const activeView = app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView === null) {
			if (this.lastactiveView === null) {
				slconsolelog(DebugLevMap.DebugLevel_High, this.slComm.slview, "ActiveView could not be defined through SemaLogic")
				return
			} else {
				return this.lastactiveView;
			}
		}
		this.lastactiveView = activeView
		slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, this.lastactiveView.getDisplayText())
		return this.lastactiveView
	}

	setViews(): void {
		this.slComm.activatedASP = false
		this.app.workspace.iterateAllLeaves((leaf) => {
			switch (leaf.view.getViewType()) {
				case SemaLogicViewType: {
					this.slComm.slview = (leaf.view as SemaLogicView)
					this.slComm.slview.setComm(this.slComm)
					this.slComm.slview.slComm.setSlView(this.slComm.slview)
					this.slComm.slview.slComm.slPlugin = this.slComm.slPlugin
					this.activated = true
					this.statusSL = true
					break
				}
				case ASPViewType: {
					this.slComm.slaspview = (leaf.view as ASPView)
					this.slComm.slaspview.setComm(this.slComm)
					this.slComm.slaspview.slComm.setSlView(this.slComm.slview)
					this.slComm.slaspview.slComm.slPlugin = this.slComm.slPlugin
					this.slComm.activatedASP = true
					this.statusTransfer = true

					break
				}
			}
		})
		this.slComm.activatedKnowledge = (this.knowledgeLeaf != undefined) || (this.findKnowledgeCanvasLeaf() != undefined)
		slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm?.slview, 'Knowledge active: ' + String(this.slComm.activatedKnowledge))
		this.getActiveView()
		//this.semaLogicUpdate(false)
	}

	async onload(): Promise<void> {
		slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, `SemaLogic debug build: ${SL_DEBUG_BUILD}`)
		this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
			if (!this.pluginEnabled) { return }
			const selection = editor.getSelection()
			if (!selection || selection.length == 0) { return }
			menu.addItem((item) => {
				item.setTitle("Edit in SL-Graph")
					.onClick(() => {
						this.startKnowledgeEdit(view as MarkdownView, selection);
					});
			});
			menu.addItem((item) => {
				item.setTitle("SL-Interpreter")
					.onClick(() => {
						this.startSLInterpreter(view as MarkdownView, selection);
					});
			});
		}));

		this.registerEvent(this.app.workspace.on("layout-change", () => {
			this.attachCanvasTooltipsToAllLeaves()
			this.syncSelectionActionHeaderButtons()
			this.hideSelectionActionPopup()
			if (this.knowledgeEditLeaf != undefined && this.findKnowledgeEditLeaf() == undefined) {
				this.stopKnowledgeEdit();
			}
			if (this.interpreterLeaf != undefined && this.findInterpreterLeaf() == undefined) {
				this.stopSLInterpreter();
			}
		}));

		this.registerEvent(this.app.vault.on("modify", (file) => {
			const path = normalizePath(file.path)
			if (file instanceof TFile && this.canvasEdgeModes.has(path)) {
				this.syncNewCanvasEdgesToMode(file)
			}
			if (path == normalizePath(this.knowledgeEditCanvasPath)) {
				if (!this.pauseAllRequests || this.knowledgeEditSelection == undefined) { return }
				if (this.knowledgeEditDebounce != undefined) {
					window.clearTimeout(this.knowledgeEditDebounce)
				}
				this.knowledgeEditDebounce = window.setTimeout(() => {
					this.tickKnowledgeEdit()
				}, 300)
			}
			if (path == normalizePath(this.interpreterCanvasPath)) {
				if (!this.pauseAllRequests || this.interpreterSelection == undefined) { return }
				if (this.interpreterDebounce != undefined) {
					window.clearTimeout(this.interpreterDebounce)
				}
				this.interpreterDebounce = window.setTimeout(() => {
					this.tickSLInterpreter()
				}, 300)
			}
		}));

		this.registerDomEvent(document as any, "sl-interpreter" as any, () => {
			if (!this.pluginEnabled || this.pauseAllRequests) { return }
			const view = this.app.workspace.getActiveViewOfType(MarkdownView)
			if (!view) { return }
			const selection = view.editor.getSelection()
			if (!selection || selection.length == 0) { return }
			this.startSLInterpreter(view, selection)
		});
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement | null
			const link = target?.closest("a[data-sl-interpreter='1']") as HTMLAnchorElement | null
			if (!link) { return }
			evt.preventDefault()
			evt.stopPropagation()
			if (!this.pluginEnabled || this.pauseAllRequests) { return }
			const selection = link.textContent ?? ""
			if (selection.length == 0) { return }
			const view = this.app.workspace.getActiveViewOfType(MarkdownView)
			const slText = link.getAttribute("data-sl-text")?.trim() || link.getAttribute("title")?.trim() || ""
			const trackSelection = (view && slText.length > 0) ? this.findSLInterpreterSelectionForAnchor(view, selection, slText) : undefined
			if (slText.length > 0) {
				this.startSLInterpreterFromSLText(selection, slText, trackSelection)
				return
			}
			this.startSLInterpreterFromText(selection)
		});

		this.registerDomEvent(document, "dblclick", (evt: MouseEvent) => {
			if (!this.activated || this.pauseAllRequests) { return }
			const view = this.app.workspace.getActiveViewOfType(MarkdownView)
			if (!view) { return }
			const target = evt.target as HTMLElement | null
			if (!target || !view.contentEl.contains(target)) { return }
			if (this.parseDebounce != undefined) {
				window.clearTimeout(this.parseDebounce)
			}
			this.parseDebounce = window.setTimeout(() => {
				this.lastParsedHash = ""
				this.semaLogicUpdate()
			}, 200)
		});
		this.registerDomEvent(document, "selectionchange", () => {
			this.scheduleSelectionActionPopupUpdate()
		});
		this.registerDomEvent(document, "mouseup", () => {
			this.scheduleSelectionActionPopupUpdate()
		});
		this.registerDomEvent(document, "keyup", () => {
			this.scheduleSelectionActionPopupUpdate()
		});
		this.registerDomEvent(document, "touchend", () => {
			this.scheduleSelectionActionPopupUpdate(120)
		});
		this.registerDomEvent(document, "scroll", () => {
			this.hideSelectionActionPopupSoon()
		}, true);
		this.registerDomEvent(window, "resize", () => {
			this.hideSelectionActionPopup()
		});
		this.registerDomEvent(document, "pointerdown", (evt: PointerEvent) => {
			const target = evt.target as HTMLElement | null
			if (target != null && this.selectionActionPopupEl?.contains(target)) { return }
			this.hideSelectionActionPopup()
		});

		this.registerMarkdownPostProcessor((element, context) => {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, element)
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, context)
			element.querySelectorAll("p").forEach((el) => {
				if (searchForSemaLogicCommands(el)) {
					let set = this.settings
					context.addChild(new SemaLogicRenderedElement({ containerEl: el as HTMLElement, set }));
				}
			});
		})

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SemaLogicSettingTab(this.app, this));
		await this.loadSettings();
		this.pluginEnabled = true
		DebugLevel = this.settings.myDebugLevel
		this.app.workspace.onLayoutReady(() => {
			this.syncSelectionActionHeaderButtons()
		})

		// This adds a status bar for informations
		this.myStatus = this.addStatusBarItem()

		this.slComm = new SemaLogicPluginComm
		this.slComm.setSLClass(this)

		await this.activateView();
		this.statusSL = true
		// Clear SemaLogic to start with a clear service
		await this.semaLogicReset();
		this.setViews()

		// add an RibbonIcon to activcate and deactivate the SemaLogicView
		this.addRibbonIcon("book", "On/Off SemaLogic.View", () => {
			this.setViews()
			if (this.activated == false) {
				this.statusSL = true
				if (!this.activated) {
					this.activateView()
				}
			} else {
				this.statusSL = false
				this.deactivateView();
			}

		});
		// add an RibbonIcon to activcate and deactivate the SemaLogicView
		this.addRibbonIcon("dice", "On/Off Transfer.View", () => {
			this.setViews()
			if (this.slComm != undefined) {
				if (this.slComm.activatedASP == false) {
					this.activateASPView();
				} else {
					this.deactivateASPView();
				}
			}
		});
		// add an RibbonIcon to activcate and deactivate the Knowledge.View
		this.addRibbonIcon("share-2", "On/Off Knowledge.View", () => {
			this.setViews()
			if (this.slComm != undefined) {
				if (this.slComm.activatedKnowledge == false) {
					this.activateKnowledgeView();
				} else {
					this.deactivateKnowledgeView();
				}
			}
		});
		// add an RibbonIcon to activcate and deactivate the SemaLogicView
		//this.addRibbonIcon("file-type-2", "Create TemplateFolder", () => {
		//	createTemplateFolder(app.vault)
		//});

		this.addCommand({
			id: "sl_create_template",
			name: "SemaLogic create template",
			callback: () => {
				createTemplateFolder(app.vault);
				createExamples(app.vault);
			},
		});

		this.attachCanvasTooltipsToAllLeaves()

		this.addCommand({
			id: "sl_create_test_canvas",
			name: "UseSemaLogic: test canvas simple",
			callback: () => {
				createTestCanvas(app.vault);
			},
		});
		this.addCommand({
			id: "sl_create_template_canvas",
			name: "UseSemaLogic: test canvas komplex",
			callback: () => {
				createTemplateCanvas(app.vault);
			},
		});


		if (this.statusSL) {
			this.semaLogicReset();
			// Default is that SemaLogicView is activated but it can be deactivated by click on Ribbon Icon
			if (this.slComm.slview != undefined) {
				this.slComm.slview.setNewInitial(this.settings.mySLSettings[this.settings.mySetting].myOutputFormat, true);
			}
			this.semaLogicParse();
		}
		this.registerEditorExtension([EditorView.updateListener.of(this.handleUpdate), slTermHider]);
	}

	async semaLogicParse(): Promise<Node[]> {
		if (this.pauseAllRequests) {
			return [];
		}

		this.setViews();
		if (this.slComm?.slview == undefined) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, "Skip SemaLogicParse: slview not ready")
			return [];
		}

		slconsolelog(DebugLevMap.DebugLevel_, this.slComm.slview, 'Start SemaLogicParse')
		let results: Node[] = [];

		this.lastUpdate = Date.now()
		await semaLogicPing(this.settings, this.lastUpdate)

		// let vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + this.settings.mySLSettings[this.settings.mySetting].mySID;
		let vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + mygSID;
		slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, vAPI_URL)

		let bodytext: string = "";
		let activeView = this.getActiveView()
		if (activeView != undefined) { this.slComm.slUsedMDView = activeView }

		let dialectID: string = "default"
		let codeblock: boolean = false;
		let newCodeblock: boolean = false;

		if (activeView != null) {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, 'ActiveView is not NULL')

			for (let i = 0; i < activeView.editor.lineCount(); i++) {
				slconsolelog(DebugLevMap.DebugLevel_All, this.slComm.slview, i, ';', activeView.editor.getLine(i))
				slconsolelog(DebugLevMap.DebugLevel_All, this.slComm.slview, 'Substring:', activeView.editor.getLine(i).substring(0, 2));
				if (activeView.editor.getLine(i).substring(0, 3) == "```") {
					if (!codeblock) {
						codeblock = true
						newCodeblock = true
						slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, 'Current line is Codeblock: ' + i.toString(), codeblock)
					} else {
						newCodeblock = false
					}
				}

				if ((!codeblock) && (!newCodeblock)) {
					// Check inline Statements
					bodytext = bodytext.concat(activeView.editor.getLine(i) + '\n')
				}
				else {
					// Check which dialect to use
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


		bodytext = this.view_utils.cleanCommands(bodytext)
		bodytext = this.normalizeSLInterpreterTerms(bodytext)
		if (dialectID == "") { dialectID = "default" }

		const newHash = `${dialectID}|${bodytext}`
		if (newHash == this.lastParsedHash) {
			return results
		}
		this.lastParsedHash = newHash

		slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "Parsingresult for SemaLogicView")
		const responseForSemaLogic = this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, dialectID, bodytext, false)
		responseForSemaLogic.then(value => {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, value)
		})

		//slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Check: UpdateASPOutstanding = false:' + this.updateTransferOutstanding)
		if (this.slComm.activatedASP) {
			if (Date.now() - this.slComm.slaspview.LastRequestTime >= this.settings.mySLSettings[this.settings.mySetting].myUpdateInterval) {
				//this.slComm.slaspview.contentEl.empty
				this.slComm.slaspview.LastRequestTime = Date.now()
				slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, `Set-Requesttime: ${this.slComm.slaspview.LastRequestTime}`)

				//slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, "Parsingresult for OnTheFly Transfer.view in SemaLogic")
				//const parseCommands = this.slComm.slaspview.getASPCommands(this.slComm, this.settings)
				this.updateTransferOutstanding = false
				//parseCommands.commands.forEach(command => {
				let outputFormat: string = RulesettypesCommands[Rstypes_ASP][1]
				//	if (command.outputformat != undefined && command.outputformat != RulesettypesCommands[Rstypes_ASP][0]) { outputFormat = command.outputformat }

				const responseForASP = this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, dialectID, bodytext, true, outputFormat)
				responseForASP.then(value => {
					//this.updateTransferOutstanding = true;
					//slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Set UpdateASPOutstanding:' + this.updateTransferOutstanding)
					slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, value)
					const aspPromise = this.slComm.slaspview.aspParse(this.slComm, this.settings, value, this.slComm.slaspview.LastRequestTime)
					aspPromise.then(value => {
						if (value != undefined) { slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, value) }
						//
						//slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Set UpdateASPOutstanding:' + this.updateTransferOutstanding)
					})
				})
			} else { this.updateTransferOutstanding = true }
		}

		if (this.slComm.activatedKnowledge) {
			if (Date.now() - this.knowledgeLastRequestTime >= this.settings.mySLSettings[this.settings.mySetting].myUpdateInterval) {
				this.knowledgeLastRequestTime = Date.now()
				const requestTime = this.knowledgeLastRequestTime
				slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, `Knowledge request (sid=${mygSID}) url=${vAPI_URL}`)
				const responseForKnowledge = this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, dialectID, bodytext, true, RulesettypesCommands[Rstypes_KnowledgeGraph][1])
				responseForKnowledge.then(value => {
					if (this.knowledgeLastRequestTime == requestTime) {
						this.updateKnowledgeCanvas(value)
					}
				})
			}
		}

		return results
	}

	private normalizeSLInterpreterTerms(text: string): string {
		const re = /[\u00c2]?\u00ab(.+?)[\u00c2]?\u00bb\s*\((SL64|SL):([^)]+)\)/g;
		const normalizedLegacy = text.replace(re, (_m, _orig, mode, rawTerm) => {
			if (mode == "SL64") {
				return this.decodeSLTerm(String(rawTerm ?? ""));
			}
			let term = String(rawTerm ?? "");
			term = term.replace(/\\\)/g, ")").replace(/\\\(/g, "(").replace(/\\\\/g, "\\");
			return term;
		});
		const anchorRe = /<a\b[^>]*\bdata-sl-interpreter\s*=\s*(['\"])1\1[^>]*>([\s\S]*?)<\/a>/gi;
		return normalizedLegacy.replace(anchorRe, (_m, _quote, inner) => this.decodeHtmlEntities(String(inner ?? "")));
	}
	private encodeSLTerm(text: string): string {
		const utf8 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_m, p1) => {
			return String.fromCharCode(parseInt(p1, 16));
		});
		return btoa(utf8);
	}

	private decodeSLTerm(b64: string): string {
		try {
			const bin = atob(b64);
			const pct = Array.from(bin, (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
			return decodeURIComponent(pct);
		} catch (e) {
			return "";
		}
	}

	private escapeHtmlAttribute(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/"/g, "&quot;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}

	private escapeHtmlText(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}

	private decodeHtmlEntities(text: string): string {
		const textarea = document.createElement("textarea");
		textarea.innerHTML = text;
		return textarea.value;
	}

	private buildSLInterpreterAnchor(originalText: string, interpretedText: string): string {
		const escapedTitle = this.escapeHtmlAttribute(interpretedText);
		const escapedSLText = this.escapeHtmlAttribute(interpretedText);
		const escapedText = this.escapeHtmlText(originalText);
		const style = "color: black; text-decoration-color: blue; text-decoration-line: underline; text-decoration-style: dashed;";
		return `<a href="#sl-interpreter" data-sl-interpreter="1" data-sl-text="${escapedSLText}" title="${escapedTitle}" style="${style}">${escapedText}</a>`;
	}

	private extractHtmlAttributeValue(tagText: string, attributeName: string): string {
		const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`\\b${escapedName}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "i");
		const match = tagText.match(re);
		return match ? this.decodeHtmlEntities(match[2] ?? "") : "";
	}

	private extractSLInterpreterAnchorData(text: string): { visibleText: string; slText: string } | undefined {
		const match = text.match(/<a\b[^>]*\bdata-sl-interpreter\s*=\s*(['"])1\1[^>]*>([\s\S]*?)<\/a>/i);
		if (!match) { return undefined }
		const tagText = match[0] ?? "";
		const innerText = this.decodeHtmlEntities(match[2] ?? "");
		const slText = this.extractHtmlAttributeValue(tagText, "data-sl-text") || this.extractHtmlAttributeValue(tagText, "title");
		return { visibleText: innerText, slText };
	}

	private findNearestTextOccurrence(haystack: string, needle: string, preferredOffset: number): number {
		if (needle.length == 0) { return -1 }
		let bestIndex = -1
		let bestDistance = Number.MAX_SAFE_INTEGER
		let searchFrom = 0
		while (searchFrom <= haystack.length) {
			const idx = haystack.indexOf(needle, searchFrom)
			if (idx < 0) { break }
			const distance = Math.abs(idx - preferredOffset)
			if (distance < bestDistance) {
				bestDistance = distance
				bestIndex = idx
			}
			searchFrom = idx + 1
		}
		return bestIndex
	}

	private findSLInterpreterSelectionForAnchor(view: MarkdownView, originalText: string, interpretedText: string): { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } } | undefined {
		const anchorText = this.buildSLInterpreterAnchor(originalText, interpretedText)
		const docText = view.editor.getValue()
		const cursor = view.editor.getCursor("from")
		const preferredOffset = view.editor.posToOffset(cursor)
		const fromOffset = this.findNearestTextOccurrence(docText, anchorText, preferredOffset)
		if (fromOffset < 0) { return undefined }
		return {
			view,
			from: view.editor.offsetToPos(fromOffset),
			to: view.editor.offsetToPos(fromOffset + anchorText.length)
		}
	}

	private createSelectionActionPopup(): HTMLElement {
		if (this.selectionActionPopupEl != undefined) {
			return this.selectionActionPopupEl
		}
		const popup = document.createElement("div")
		popup.className = "sl-selection-actions"
		popup.style.display = "none"

		const editBtn = document.createElement("button")
		editBtn.type = "button"
		editBtn.className = "sl-selection-action-btn"
		editBtn.textContent = "SL-Edit"
		editBtn.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selection = this.getSelectionActionContext()
			if (selection == undefined) { return }
			this.hideSelectionActionPopup()
			await this.startKnowledgeEdit(selection.view, selection.text)
		})

		const interpretBtn = document.createElement("button")
		interpretBtn.type = "button"
		interpretBtn.className = "sl-selection-action-btn"
		interpretBtn.textContent = "SL-Interpret"
		interpretBtn.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selection = this.getSelectionActionContext()
			if (selection == undefined) { return }
			this.hideSelectionActionPopup()
			await this.startSLInterpreter(selection.view, selection.text)
		})

		popup.appendChild(editBtn)
		popup.appendChild(interpretBtn)
		document.body.appendChild(popup)
		this.selectionActionPopupEl = popup
		return popup
	}

	public updateSelectionActionButtonUi(): void {
		this.syncSelectionActionHeaderButtons()
		if (!this.settings.showSelectionActionButtons) {
			this.hideSelectionActionPopup()
			return
		}
		this.scheduleSelectionActionPopupUpdate()
	}

	private updateSelectionActionHeaderButton(button: HTMLElement): void {
		const enabled = this.settings.showSelectionActionButtons
		button.classList.toggle("is-active", enabled)
		button.setAttribute("aria-label", enabled ? "Hide SL selection actions" : "Show SL selection actions")
		button.setAttribute("title", enabled ? "Hide SL selection actions" : "Show SL selection actions")
		setIcon(button, enabled ? "toggle-right" : "toggle-left")
	}

	private syncSelectionActionHeaderButtons(): void {
		if (this.settings == undefined || !this.app.workspace.layoutReady) { return }
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() != "markdown") { return }
			const container = leaf.view.containerEl
			if (container == undefined) { return }
			const actionsEl = container.querySelector(".view-actions")
			if (!(actionsEl instanceof HTMLElement)) { return }
			let button = this.selectionActionHeaderButtons.get(leaf)
			if (button == undefined || !actionsEl.contains(button)) {
				const existing = actionsEl.querySelector("[data-sl-selection-toggle='1']")
				if (existing instanceof HTMLElement) {
					button = existing
				} else {
					const newButton = document.createElement("button")
					newButton.type = "button"
					button = newButton
					button.className = "clickable-icon"
					button.setAttribute("data-sl-selection-toggle", "1")
					button.addEventListener("click", async (evt) => {
						evt.preventDefault()
						evt.stopPropagation()
						this.settings.showSelectionActionButtons = !this.settings.showSelectionActionButtons
						await this.saveSettings()
						this.updateSelectionActionButtonUi()
					})
					actionsEl.insertBefore(button, actionsEl.firstChild)
				}
				this.selectionActionHeaderButtons.set(leaf, button)
			}
			this.updateSelectionActionHeaderButton(button)
		})
	}

	private hideSelectionActionPopup(): void {
		if (this.selectionActionHideDebounce != undefined) {
			window.clearTimeout(this.selectionActionHideDebounce)
			this.selectionActionHideDebounce = undefined
		}
		if (this.selectionActionPopupEl != undefined) {
			this.selectionActionPopupEl.style.display = "none"
		}
	}

	private hideSelectionActionPopupSoon(): void {
		if (this.selectionActionHideDebounce != undefined) {
			window.clearTimeout(this.selectionActionHideDebounce)
		}
		this.selectionActionHideDebounce = window.setTimeout(() => {
			this.hideSelectionActionPopup()
		}, 120)
	}

	private scheduleSelectionActionPopupUpdate(delay: number = 60): void {
		if (this.selectionActionUpdateDebounce != undefined) {
			window.clearTimeout(this.selectionActionUpdateDebounce)
		}
		this.selectionActionUpdateDebounce = window.setTimeout(() => {
			this.selectionActionUpdateDebounce = undefined
			this.updateSelectionActionPopup()
		}, delay)
	}

	private getTextSelectionRect(selection: Selection): DOMRect | undefined {
		if (selection.rangeCount == 0) { return undefined }
		const range = selection.getRangeAt(0)
		const rects = range.getClientRects()
		if (rects.length > 0) {
			return rects[0]
		}
		const rect = range.getBoundingClientRect()
		if (rect.width == 0 && rect.height == 0) { return undefined }
		return rect
	}

	private getEditorSelectionRect(view: MarkdownView): DOMRect | undefined {
		const selection = window.getSelection()
		const domRect = selection != null ? this.getTextSelectionRect(selection) : undefined
		if (domRect != undefined) {
			return domRect
		}
		const selectionEls = Array.from(view.contentEl.querySelectorAll(".cm-selectionBackground")) as HTMLElement[]
		for (const el of selectionEls) {
			const rect = el.getBoundingClientRect()
			if (rect.width > 0 || rect.height > 0) {
				return rect
			}
		}
		return undefined
	}

	private findTextSelectionRange(view: MarkdownView, selectedText: string): { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } } | undefined {
		const text = selectedText.trim()
		if (text.length == 0) { return undefined }
		const docText = view.editor.getValue()
		const cursor = view.editor.getCursor("from")
		const preferredOffset = view.editor.posToOffset(cursor)
		const fromOffset = this.findNearestTextOccurrence(docText, text, preferredOffset)
		if (fromOffset < 0) { return undefined }
		return {
			view,
			from: view.editor.offsetToPos(fromOffset),
			to: view.editor.offsetToPos(fromOffset + text.length)
		}
	}

	private getSelectionActionContext(): { view: MarkdownView; text: string; rect: DOMRect } | undefined {
		if (!this.pluginEnabled || this.pauseAllRequests || !this.settings.showSelectionActionButtons) { return undefined }
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (view == undefined) { return undefined }

		const domSelection = window.getSelection()
		const domText = domSelection?.toString().trim() ?? ""
		const rect = domSelection != null ? this.getTextSelectionRect(domSelection) : undefined
		const editorSelection = view.editor.getSelection()

		if (editorSelection.trim().length > 0) {
			const editorRect = this.getEditorSelectionRect(view)
			if (editorRect == undefined) { return undefined }
			return { view, text: editorSelection, rect: editorRect }
		}

		if (domSelection == null || domText.length == 0 || rect == undefined) { return undefined }
		const anchorNode = domSelection.anchorNode
		const focusNode = domSelection.focusNode
		const anchorEl = anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement
		const focusEl = focusNode instanceof HTMLElement ? focusNode : focusNode?.parentElement
		if (anchorEl == undefined || focusEl == undefined) { return undefined }
		if (!view.contentEl.contains(anchorEl) || !view.contentEl.contains(focusEl)) { return undefined }
		if (anchorEl.closest(".cm-editor") != null || focusEl.closest(".cm-editor") != null) { return undefined }
		if (this.findTextSelectionRange(view, domText) == undefined) { return undefined }
		return { view, text: domText, rect }
	}

	private updateSelectionActionPopup(): void {
		const selection = this.getSelectionActionContext()
		if (selection == undefined) {
			this.hideSelectionActionPopup()
			return
		}
		const popup = this.createSelectionActionPopup()
		const top = Math.max(8, Math.round(selection.rect.bottom + window.scrollY + 10))
		const left = Math.max(8, Math.round(selection.rect.left + window.scrollX))
		popup.style.top = `${top}px`
		popup.style.left = `${left}px`
		popup.style.display = "flex"
	}

	private async startSLInterpreterRequest(selection: string, requestText: string, useNlp: boolean, trackSelection?: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } }): Promise<void> {
		if (!this.pluginEnabled || selection.length == 0) { return }
		if (!(await this.ensureSemaLogicViewForRequest())) { return }

		const shouldTrackSelection = trackSelection != undefined
		if (this.interpreterInterval != undefined) {
			window.clearInterval(this.interpreterInterval)
			this.interpreterInterval = undefined
		}
		if (shouldTrackSelection) {
			this.pauseAllRequests = true
			this.updateOutstanding = false
			this.updateTransferOutstanding = false
			this.interpreterSelection = { ...trackSelection, sourceText: selection, original: selection }
		} else {
			this.interpreterSelection = undefined
		}
		this.interpreterLastCanvas = ""
		const vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + mygSID + (useNlp ? "&NLP=true" : "");
		const response = await this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, "default", requestText, true, RulesettypesCommands[Rstypes_KnowledgeGraph][1])
		if (response && this.isCanvasJsonResponse(response)) {
			await this.processCanvasResponse(response, this.interpreterCanvasPath, false)
			await this.openInterpreterCanvas()
			if (shouldTrackSelection) {
				await this.tickSLInterpreter()
				this.interpreterInterval = window.setInterval(() => {
					this.tickSLInterpreter()
				}, 500)
			}
			return
		}
		if (response && response.trim().length > 0) {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm?.slview, "SL-Interpreter response (modal)", response)
			this.showInterpreterResponseModal(response)
		}
		this.interpreterSelection = undefined
		this.interpreterLastCanvas = ""
		if (shouldTrackSelection) {
			this.pauseAllRequests = false
		}
	}

	private async startSLInterpreterFromText(selection: string, trackSelection?: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } }): Promise<void> {
		await this.startSLInterpreterRequest(selection, selection, true, trackSelection)
	}

	private async startSLInterpreterFromSLText(selection: string, slText: string, trackSelection?: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } }): Promise<void> {
		await this.startSLInterpreterRequest(selection, slText, false, trackSelection)
	}

	private async processCanvasResponse(raw: string, canvasPath: string, allowFiles: boolean): Promise<void> {
		if (!raw || raw.length == 0) {
			await this.writeCanvasFile(canvasPath, "{ \"nodes\": [], \"edges\": [] }")
			return;
		}
		try {
			const parsed = JSON.parse(raw)
			if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
				if (allowFiles && Array.isArray(parsed.files)) {
					await this.createFilesFromResponse(parsed.files)
				}
				const canvas = { nodes: parsed.nodes, edges: parsed.edges }
				await this.writeCanvasFile(canvasPath, JSON.stringify(canvas))
				return;
			}
		} catch (e) {
			// fall through to raw
		}
		await this.writeCanvasFile(canvasPath, raw)
	}

	private async writeCanvasFile(path: string, content: string): Promise<void> {
		const norm = normalizePath(path)
		const folder = norm.split("/").slice(0, -1).join("/")
		if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
			await this.app.vault.createFolder(folder)
		}
		let file = this.app.vault.getAbstractFileByPath(norm)
		if (file == null) {
			file = await this.app.vault.create(norm, content)
		} else {
			await this.app.vault.adapter.write(norm, content)
			await this.app.vault.modify(file as TFile, content)
		}
	}

	private async createFilesFromResponse(files: any[]): Promise<void> {
		for (const f of files) {
			const p = normalizePath(String(f?.path ?? ""))
			if (!p) { continue }
			const content = String(f?.content ?? "")
			const folder = p.split("/").slice(0, -1).join("/")
			if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
				await this.app.vault.createFolder(folder)
			}
			let file = this.app.vault.getAbstractFileByPath(p)
			if (file == null) {
				await this.app.vault.create(p, content)
			} else {
				await this.app.vault.adapter.write(p, content)
				await this.app.vault.modify(file as TFile, content)
			}
		}
	}

	private attachCanvasTooltips(leaf: WorkspaceLeaf): void {
		if (this.canvasTooltipObservers.has(leaf)) { return }
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		this.bindCanvasSelectionTracking(container)
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "Attach canvas tooltips: observer start")
		const observer = new MutationObserver(() => {
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas DOM mutation [${SL_DEBUG_BUILD}]`)
			this.refreshCanvasNodeAnchorTracking(leaf)
			this.refreshCanvasTooltips(leaf)
			this.updateCanvasMenuAnchorState(leaf)
			this.addCanvasToolbarInsertControls(leaf)
			this.addCanvasInfoButton(leaf)
			this.addCanvasInsertControls(leaf)
			this.addCanvasChangeControls(leaf)
			this.addCanvasMenuEdgeModeControls(leaf)
			this.addCanvasEdgeModeControls(leaf)
			this.updateCanvasEdgeModeControls(leaf)
			this.updateCanvasToolbarVisibility(leaf)
			this.updateCanvasInfoButton(leaf)
		})
		observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] })
		this.canvasTooltipObservers.set(leaf, observer)
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "Attach canvas tooltips: initial refresh")
		this.refreshCanvasNodeAnchorTracking(leaf)
		this.refreshCanvasTooltips(leaf)
		this.updateCanvasMenuAnchorState(leaf)
		this.addCanvasToolbarInsertControls(leaf)
		this.addCanvasInfoButton(leaf)
		this.addCanvasInsertControls(leaf)
		this.addCanvasChangeControls(leaf)
		this.addCanvasMenuEdgeModeControls(leaf)
		this.addCanvasEdgeModeControls(leaf)
		this.updateCanvasEdgeModeControls(leaf)
		this.updateCanvasToolbarVisibility(leaf)
		this.updateCanvasInfoButton(leaf)
	}

	private attachCanvasTooltipsToAllLeaves(): void {
		let count = 0
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() == "canvas") {
				count++
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Attach canvas tooltips: leaf ${count}`)
				this.attachCanvasTooltips(leaf)
			}
		})
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Attach canvas tooltips: total ${count}`)
	}

	private async refreshCanvasTooltips(leaf: WorkspaceLeaf): Promise<void> {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }
		const maps = await this.loadCanvasNodeFileMaps(canvasFile)
		if (maps.idMap.size == 0 && maps.textMap.size == 0) { return }
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas tooltip map sizes id=${maps.idMap.size} text=${maps.textMap.size}`)
		let singleFilePath: string | undefined
		if (maps.idMap.size + maps.textMap.size == 1) {
			for (const v of maps.idMap.values()) { singleFilePath = v }
			for (const v of maps.textMap.values()) { singleFilePath = v }
		}
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const nodes = Array.from(container.querySelectorAll<HTMLElement>(".canvas-node"))
		for (const el of nodes) {
			if (el.dataset.slTooltipBound == "1") { continue }
			const id = el.getAttribute("data-node-id") || el.getAttribute("data-id") || el.dataset.nodeId || el.dataset.id
			let filePath: string | undefined
			if (id) {
				filePath = maps.idMap.get(id)
			}
			if (!filePath) {
				let nodeText = ""
				const textEl = el.querySelector<HTMLElement>(".canvas-node-content .markdown-preview-view p, .canvas-node-content textarea, .canvas-node-content")
				nodeText = textEl?.textContent?.trim() ?? ""
				if (!nodeText) {
					const iframe = el.querySelector<HTMLIFrameElement>("iframe.embed-iframe")
					const doc = iframe?.contentDocument
					const p = doc?.querySelector("p")
					nodeText = p?.textContent?.trim() ?? ""
				}
				if (nodeText) {
					slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas node text="${nodeText}"`)
				}
				if (nodeText.length > 0) {
					const normalized = this.extractNodeIdText(nodeText)
					filePath = maps.textMap.get(nodeText) ?? maps.idTextMap.get(normalized)
				}
			}
			if (!filePath && singleFilePath) {
				filePath = singleFilePath
			}
			if (filePath) {
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas tooltip file=${filePath}`)
			}
			if (!filePath) { continue }
			const fp = filePath
			el.dataset.slTooltipBound = "1"
			el.addEventListener("mouseenter", async (evt) => {
				const content = await this.safeReadFile(fp)
				if (content.length == 0) { return }
				this.showCanvasTooltip(content, evt as MouseEvent)
			})
			el.addEventListener("mouseleave", () => {
				this.hideCanvasTooltip()
			})
		}
	}

	private refreshCanvasNodeAnchorTracking(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-node-id], .canvas-node[data-id], [data-id]"))
		for (const node of nodes) {
			if (node.closest(".canvas-menu")) { continue }
			if (node.dataset.slAnchorBound == "1") { continue }
			node.dataset.slAnchorBound = "1"
			const rememberNode = () => {
				const nodeId = this.extractCanvasDomNodeId(node)
				if (!nodeId) { return }
				container.dataset.slLastNodeId = nodeId
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas node anchor bound: last node=${nodeId}`)
			}
			node.addEventListener("pointerdown", rememberNode, true)
			node.addEventListener("mousedown", rememberNode, true)
			node.addEventListener("click", rememberNode, true)
		}
	}

	private async loadCanvasNodeFileMaps(canvasFile: TFile): Promise<{ idMap: Map<string, string>; textMap: Map<string, string>; dataIdMap: Map<string, string>; dataTextMap: Map<string, string>; idTextMap: Map<string, string>; dataIdTextMap: Map<string, string> }> {
		const cache = this.canvasNodeFileCache.get(canvasFile.path)
		const stat = await this.app.vault.adapter.stat(canvasFile.path)
		if (cache && stat && cache.mtime == stat.mtime) {
			return { idMap: cache.map, textMap: cache.textMap ?? new Map(), dataIdMap: cache.dataMap ?? new Map(), dataTextMap: cache.dataTextMap ?? new Map(), idTextMap: cache.idTextMap ?? new Map(), dataIdTextMap: cache.dataIdTextMap ?? new Map() }
		}
		let raw = ""
		try {
			raw = await this.app.vault.cachedRead(canvasFile)
		} catch (e) {
			return { idMap: new Map(), textMap: new Map(), dataIdMap: new Map(), dataTextMap: new Map(), idTextMap: new Map(), dataIdTextMap: new Map() }
		}
		let parsed: any
		try {
			parsed = JSON.parse(raw)
		} catch (e) {
			return { idMap: new Map(), textMap: new Map(), dataIdMap: new Map(), dataTextMap: new Map(), idTextMap: new Map(), dataIdTextMap: new Map() }
		}
		const map = new Map<string, string>()
		const textMap = new Map<string, string>()
		const dataMap = new Map<string, string>()
		const dataTextMap = new Map<string, string>()
		const idTextMap = new Map<string, string>()
		const dataIdTextMap = new Map<string, string>()
		if (parsed && Array.isArray(parsed.nodes)) {
			for (const n of parsed.nodes) {
				const id = String(n?.id ?? "")
				if (!id) { continue }
				const meta = n?.meta ?? {}
				const linked = meta?.SL_LinkedFile ?? n?.SL_LinkedFile
				const data = meta?.SL_DataFile ?? n?.SL_DataFile
				const rawText = String(n?.text ?? "").trim()
				const nodeIdText = this.extractNodeIdText(rawText)
				if (linked) {
					map.set(id, String(linked))
					if (rawText.length > 0 && !textMap.has(rawText)) {
						textMap.set(rawText, String(linked))
					}
					if (nodeIdText.length > 0 && !idTextMap.has(nodeIdText)) {
						idTextMap.set(nodeIdText, String(linked))
					}
				}
				if (data) {
					dataMap.set(id, String(data))
					if (rawText.length > 0 && !dataTextMap.has(rawText)) {
						dataTextMap.set(rawText, String(data))
					}
					if (nodeIdText.length > 0 && !dataIdTextMap.has(nodeIdText)) {
						dataIdTextMap.set(nodeIdText, String(data))
					}
				}
			}
		}
		if (stat) {
			this.canvasNodeFileCache.set(canvasFile.path, { mtime: stat.mtime, map, textMap, dataMap, dataTextMap, idTextMap, dataIdTextMap })
		}
		return { idMap: map, textMap, dataIdMap: dataMap, dataTextMap, idTextMap, dataIdTextMap }
	}

	private async safeReadFile(path: string): Promise<string> {
		const norm = normalizePath(path)
		const file = this.app.vault.getAbstractFileByPath(norm)
		if (!file) {
			try {
				return await this.app.vault.adapter.read(norm)
			} catch (e) {
				return ""
			}
		}
		try {
			return await this.app.vault.cachedRead(file as TFile)
		} catch (e) {
			return ""
		}
	}

	private showCanvasTooltip(content: string, evt: MouseEvent): void {
		this.hideCanvasTooltip()
		const tooltip = document.createElement("div")
		tooltip.className = "sl-node-tooltip"
		document.body.appendChild(tooltip)
		this.canvasTooltipEl = tooltip
		try {
			MarkdownRenderer.renderMarkdown(content, tooltip, "", this)
		} catch (e) {
			tooltip.textContent = content
		}
		const x = evt.clientX + 12
		const y = evt.clientY + 12
		tooltip.style.left = `${x}px`
		tooltip.style.top = `${y}px`
		const onDocClick = (e: MouseEvent) => {
			const target = e.target as Node | null
			if (this.canvasTooltipEl && target && this.canvasTooltipEl.contains(target)) { return }
			this.hideCanvasTooltip()
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				this.hideCanvasTooltip()
			}
		}
		const onWheel = () => {
			this.hideCanvasTooltip()
		}
		document.addEventListener("click", onDocClick, true)
		document.addEventListener("keydown", onKey, true)
		document.addEventListener("wheel", onWheel, true)
		this.canvasTooltipCleanup = () => {
			document.removeEventListener("click", onDocClick, true)
			document.removeEventListener("keydown", onKey, true)
			document.removeEventListener("wheel", onWheel, true)
		}
	}

	private hideCanvasTooltip(): void {
		if (this.canvasTooltipEl) {
			this.canvasTooltipEl.remove()
			this.canvasTooltipEl = undefined
		}
		if (this.canvasTooltipCleanup) {
			this.canvasTooltipCleanup()
			this.canvasTooltipCleanup = undefined
		}
	}

	private showInterpreterResponseModal(content: string): void {
		this.hideInterpreterResponseModal()
		const wrapper = document.createElement("div")
		wrapper.className = "sl-interpreter-modal"
		const box = document.createElement("div")
		box.className = "sl-interpreter-modal-box"
		const header = document.createElement("div")
		header.className = "sl-interpreter-modal-header"
		header.textContent = "SL-Interpreter"
		const body = document.createElement("div")
		body.className = "sl-interpreter-modal-body"
		body.textContent =
			"The generative AI could not find logical expressions that were clear and unambiguous enough to translate into SemaLogic."
		const response = document.createElement("div")
		response.className = "sl-interpreter-modal-response"
		response.textContent = content
		const closeBtn = document.createElement("button")
		closeBtn.className = "sl-interpreter-modal-close"
		closeBtn.textContent = "Close"
		closeBtn.addEventListener("click", () => this.hideInterpreterResponseModal())
		box.appendChild(header)
		box.appendChild(body)
		box.appendChild(response)
		box.appendChild(closeBtn)
		wrapper.appendChild(box)
		document.body.appendChild(wrapper)
		this.interpreterModalEl = wrapper
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				this.hideInterpreterResponseModal()
			}
		}
		document.addEventListener("keydown", onKey, true)
		this.interpreterModalCleanup = () => {
			document.removeEventListener("keydown", onKey, true)
		}
	}

	private hideInterpreterResponseModal(): void {
		if (this.interpreterModalEl) {
			this.interpreterModalEl.remove()
			this.interpreterModalEl = undefined
		}
		if (this.interpreterModalCleanup) {
			this.interpreterModalCleanup()
			this.interpreterModalCleanup = undefined
		}
	}

	private isCanvasJsonResponse(raw: string): boolean {
		try {
			const parsed = JSON.parse(raw)
			return Array.isArray(parsed?.nodes) && Array.isArray(parsed?.edges)
		} catch (e) {
			return false
		}
	}

	private addCanvasInfoButton(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-node-info-btn")) { return }

		const btn = document.createElement("button")
		btn.className = "clickable-icon sl-node-info-btn"
		btn.setAttribute("aria-label", "SL Info")
		btn.textContent = "\u24D8"
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "Canvas info button attached")
		btn.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			if (this.canvasTooltipEl) {
				this.hideCanvasTooltip()
				return
			}
			const maps = await this.loadCanvasNodeFileMaps(canvasFile)
			let filePath: string | undefined
			let nodeText = ""
			let fallbackPath: string | undefined

			const focused = this.getFocusedCanvasNode(container)
			if (focused) {
				const res = this.resolveCanvasNodeFiles(focused, maps)
				if (res.dataPath) {
					filePath = res.dataPath
					fallbackPath = undefined
				} else {
					filePath = undefined
					fallbackPath = res.linkedPath
				}
				nodeText = res.nodeText
			}

			if (!filePath && maps.dataIdMap.size + maps.dataTextMap.size == 1) {
				for (const v of maps.dataIdMap.values()) { filePath = v }
				for (const v of maps.dataTextMap.values()) { filePath = v }
			}
			if (!filePath && fallbackPath) {
				filePath = fallbackPath
			}
			if (!filePath && maps.idMap.size + maps.textMap.size == 1) {
				for (const v of maps.idMap.values()) { filePath = v }
				for (const v of maps.textMap.values()) { filePath = v }
			}

			let content = ""
			if (filePath) {
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas info button: filePath=${filePath}`)
				content = await this.safeReadFile(filePath)
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas info button: file content len=${content.length}`)
			}
			if (content.length == 0 && nodeText.length > 0) {
				content = nodeText
			}
			if (content.length == 0) { return }
			this.showCanvasTooltip(content, evt as MouseEvent)
		})

		menu.appendChild(btn)
		this.updateCanvasInfoButton(leaf)
	}

	private addCanvasInsertControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		if (this.getFocusedCanvasEdge(container)) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-canvas-node-select")) { return }
		const currentAnchorNodeId = this.getFocusedCanvasNodeId(container)
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas insert controls [${SL_DEBUG_BUILD}]: focused anchor=${currentAnchorNodeId ?? ""}`)
		if (currentAnchorNodeId) {
			menu.dataset.slAnchorNodeId = currentAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas insert controls: menu anchor set=${menu.dataset.slAnchorNodeId}`)
		}

		const nodeSelect = document.createElement("select")
		nodeSelect.className = "sl-canvas-node-select"
		nodeSelect.setAttribute("aria-label", "Insert SemaLogic node")
		nodeSelect.style.pointerEvents = "auto"
		nodeSelect.style.position = "relative"
		nodeSelect.style.zIndex = "21"
		nodeSelect.style.maxWidth = "120px"
		nodeSelect.style.fontSize = "11px"
		nodeSelect.style.marginLeft = "8px"
		nodeSelect.style.border = "1px solid rgba(148, 163, 184, 0.6)"
		nodeSelect.style.borderRadius = "6px"
		nodeSelect.style.background = "rgba(255, 255, 255, 0.95)"
		this.appendCanvasSelectOption(nodeSelect, "", "Insert node")
		this.appendCanvasSelectOption(nodeSelect, "SYMBOL", "SYMBOL")
		this.appendCanvasSelectOption(nodeSelect, "AND", "AND")
		this.appendCanvasSelectOption(nodeSelect, "OR", "OR")
		this.appendCanvasSelectOption(nodeSelect, "LEAF", "LEAF")
		this.appendCanvasSelectOption(nodeSelect, "ATTRIBUTE", "ATTRIBUTE")
		const lastSelection = this.canvasNodeInsertSelections.get(canvasFile.path)
		if (lastSelection) {
			nodeSelect.value = lastSelection
		}
		this.bindCanvasMenuControlEvents(nodeSelect)
		nodeSelect.addEventListener("change", () => {
			const selected = nodeSelect.value as CanvasNodeInsertType | ""
			if (selected) {
				this.canvasNodeInsertSelections.set(canvasFile.path, selected)
			}
		})

		const addButton = document.createElement("button")
		addButton.className = "clickable-icon sl-canvas-node-add-btn"
		addButton.type = "button"
		addButton.textContent = "Add"
		addButton.setAttribute("aria-label", "Add selected node type")
		addButton.style.fontSize = "11px"
		addButton.style.lineHeight = "1"
		addButton.style.padding = "4px 8px"
		addButton.style.borderRadius = "6px"
		addButton.style.border = "1px solid rgba(148, 163, 184, 0.6)"
		addButton.style.background = "rgba(255, 255, 255, 0.95)"
		addButton.style.color = "#334155"
		addButton.style.cursor = "pointer"
		this.bindCanvasMenuControlEvents(addButton)
		addButton.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selected = nodeSelect.value as CanvasNodeInsertType | ""
			if (!selected) {
				new Notice("Select a node type first.")
				return
			}
			this.canvasNodeInsertSelections.set(canvasFile.path, selected)
			const anchorNodeId = this.getCanvasMenuAnchorNodeId(container) || currentAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas insert click: selected=${selected} anchor=${anchorNodeId ?? ""}`)
			if (!anchorNodeId) {
				new Notice("Select a node first.")
				return
			}
			await this.insertCanvasNode(leaf, selected, anchorNodeId)
		})

		menu.appendChild(nodeSelect)
		menu.appendChild(addButton)
	}

	private addCanvasChangeControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		if (this.getFocusedCanvasEdge(container)) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-canvas-node-change-select")) { return }
		const currentAnchorNodeId = this.getFocusedCanvasNodeId(container)
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas change controls [${SL_DEBUG_BUILD}]: focused anchor=${currentAnchorNodeId ?? ""}`)
		if (currentAnchorNodeId) {
			menu.dataset.slAnchorNodeId = currentAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas change controls: menu anchor set=${menu.dataset.slAnchorNodeId}`)
		}

		const changeSelect = document.createElement("select")
		changeSelect.className = "sl-canvas-node-change-select"
		changeSelect.setAttribute("aria-label", "Change SemaLogic node concept")
		changeSelect.style.pointerEvents = "auto"
		changeSelect.style.position = "relative"
		changeSelect.style.zIndex = "21"
		changeSelect.style.maxWidth = "120px"
		changeSelect.style.fontSize = "11px"
		changeSelect.style.marginLeft = "8px"
		changeSelect.style.border = "1px solid rgba(148, 163, 184, 0.6)"
		changeSelect.style.borderRadius = "6px"
		changeSelect.style.background = "rgba(255, 255, 255, 0.95)"
		this.appendCanvasSelectOption(changeSelect, "", "Change node")
		this.appendCanvasSelectOption(changeSelect, "SYMBOL", "SYMBOL")
		this.appendCanvasSelectOption(changeSelect, "AND", "AND")
		this.appendCanvasSelectOption(changeSelect, "OR", "OR")
		this.appendCanvasSelectOption(changeSelect, "LEAF", "LEAF")
		this.appendCanvasSelectOption(changeSelect, "ATTRIBUTE", "ATTRIBUTE")
		this.bindCanvasMenuControlEvents(changeSelect)

		const changeButton = document.createElement("button")
		changeButton.className = "clickable-icon sl-canvas-node-change-btn"
		changeButton.type = "button"
		changeButton.textContent = "Change"
		changeButton.setAttribute("aria-label", "Change selected node concept")
		changeButton.style.fontSize = "11px"
		changeButton.style.lineHeight = "1"
		changeButton.style.padding = "4px 8px"
		changeButton.style.borderRadius = "6px"
		changeButton.style.border = "1px solid rgba(148, 163, 184, 0.6)"
		changeButton.style.background = "rgba(255, 255, 255, 0.95)"
		changeButton.style.color = "#334155"
		changeButton.style.cursor = "pointer"
		this.bindCanvasMenuControlEvents(changeButton)
		changeButton.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selected = changeSelect.value as CanvasNodeInsertType | ""
			if (!selected) {
				new Notice("Select a concept first.")
				return
			}
			const anchorNodeId = this.getCanvasMenuAnchorNodeId(container) || currentAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas change click [${SL_DEBUG_BUILD}]: selected=${selected} anchor=${anchorNodeId ?? ""}`)
			if (!anchorNodeId) {
				new Notice("Select a node first.")
				return
			}
			await this.changeCanvasNodeConcept(leaf, anchorNodeId, selected)
		})

		menu.appendChild(changeSelect)
		menu.appendChild(changeButton)
	}

	private removeCanvasInsertControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		container.querySelector(".sl-canvas-node-select")?.remove()
		container.querySelector(".sl-canvas-node-add-btn")?.remove()
	}

	private addCanvasToolbarInsertControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }
		const bar = this.ensureCanvasToolbar(leaf)
		if (bar.querySelector(".sl-canvas-toolbar-node-select")) { return }

		const section = document.createElement("div")
		section.className = "sl-canvas-toolbar-insert"
		section.style.display = "flex"
		section.style.alignItems = "center"
		section.style.gap = "6px"

		const label = document.createElement("span")
		label.textContent = "node"
		label.style.color = "#475569"
		label.style.fontSize = "11px"
		label.style.lineHeight = "1"
		section.appendChild(label)

		const nodeSelect = document.createElement("select")
		nodeSelect.className = "sl-canvas-toolbar-node-select"
		nodeSelect.setAttribute("aria-label", "Insert SemaLogic node")
		nodeSelect.style.maxWidth = "120px"
		nodeSelect.style.fontSize = "11px"
		nodeSelect.style.border = "1px solid rgba(148, 163, 184, 0.6)"
		nodeSelect.style.borderRadius = "6px"
		nodeSelect.style.background = "rgba(255, 255, 255, 0.95)"
		this.appendCanvasSelectOption(nodeSelect, "", "Insert node")
		this.appendCanvasSelectOption(nodeSelect, "SYMBOL", "SYMBOL")
		this.appendCanvasSelectOption(nodeSelect, "AND", "AND")
		this.appendCanvasSelectOption(nodeSelect, "OR", "OR")
		this.appendCanvasSelectOption(nodeSelect, "LEAF", "LEAF")
		this.appendCanvasSelectOption(nodeSelect, "ATTRIBUTE", "ATTRIBUTE")
		const lastSelection = this.canvasNodeInsertSelections.get(canvasFile.path)
		if (lastSelection) {
			nodeSelect.value = lastSelection
		}
		nodeSelect.addEventListener("change", () => {
			const selected = nodeSelect.value as CanvasNodeInsertType | ""
			if (selected) {
				this.canvasNodeInsertSelections.set(canvasFile.path, selected)
			}
		})
		section.appendChild(nodeSelect)

		const addButton = document.createElement("button")
		addButton.className = "clickable-icon sl-canvas-toolbar-node-add-btn"
		addButton.type = "button"
		addButton.textContent = "Add"
		addButton.setAttribute("aria-label", "Add selected node type")
		addButton.style.fontSize = "11px"
		addButton.style.lineHeight = "1"
		addButton.style.padding = "4px 8px"
		addButton.style.borderRadius = "6px"
		addButton.style.border = "1px solid rgba(148, 163, 184, 0.6)"
		addButton.style.background = "rgba(255, 255, 255, 0.95)"
		addButton.style.color = "#334155"
		addButton.style.cursor = "pointer"
		addButton.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selected = nodeSelect.value as CanvasNodeInsertType | ""
			if (!selected) {
				new Notice("Select a node type first.")
				return
			}
			this.canvasNodeInsertSelections.set(canvasFile.path, selected)
			await this.insertCanvasNode(leaf, selected)
		})
		section.appendChild(addButton)

		bar.appendChild(section)
		this.updateCanvasToolbarPosition(leaf)
	}

	private appendCanvasSelectOption(selectEl: HTMLSelectElement, value: string, label: string): void {
		const option = document.createElement("option")
		option.value = value
		option.textContent = label
		selectEl.appendChild(option)
	}

	private bindCanvasSelectionTracking(container: HTMLElement): void {
		if (container.dataset.slSelectionTrackingBound == "1") { return }
		container.dataset.slSelectionTrackingBound = "1"

		const trackTarget = (target: EventTarget | null) => {
			const el = target instanceof HTMLElement ? target : null
			if (!el) { return }
			if (!container.contains(el)) { return }
			const nodeEl = el?.closest(".canvas-node") as HTMLElement | null
			if (nodeEl) {
				const nodeId = nodeEl.getAttribute("data-node-id") || nodeEl.getAttribute("data-id") || nodeEl.dataset.nodeId || nodeEl.dataset.id
				if (nodeId) {
					container.dataset.slLastNodeId = nodeId
					slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas selection tracking: last node=${nodeId}`)
				}
			}
			const edgeEl = el?.closest(".canvas-edge") as HTMLElement | null
			if (edgeEl) {
				const edgeId = edgeEl.getAttribute("data-edge-id") || edgeEl.getAttribute("data-id") || edgeEl.dataset.edgeId || edgeEl.dataset.id
				if (edgeId) {
					container.dataset.slLastEdgeId = edgeId
					slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas selection tracking: last edge=${edgeId}`)
				}
			}
		}

		container.addEventListener("pointerdown", (evt) => trackTarget(evt.target), true)
		container.addEventListener("click", (evt) => trackTarget(evt.target), true)
		this.registerDomEvent(document, "pointerdown", (evt: PointerEvent) => {
			trackTarget(evt.target)
		})
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			trackTarget(evt.target)
		})
	}

	private updateCanvasMenuAnchorState(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu) { return }
		const anchorNodeId = this.getCanvasMenuDomAnchorNodeId(menu) || this.getFocusedCanvasNodeId(container) || container.dataset.slLastNodeId
		if (anchorNodeId) {
			menu.dataset.slAnchorNodeId = anchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas menu anchor update [${SL_DEBUG_BUILD}]: anchor=${anchorNodeId}`)
		} else {
			delete menu.dataset.slAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas menu anchor update [${SL_DEBUG_BUILD}]: cleared`)
		}
	}

	private getCanvasMenuAnchorNodeId(container: HTMLElement): string | undefined {
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		const domAnchor = menu ? this.getCanvasMenuDomAnchorNodeId(menu) : ""
		const menuAnchor = menu?.dataset.slAnchorNodeId || ""
		const focusedAnchor = this.getFocusedCanvasNodeId(container) || ""
		const lastAnchor = container.dataset.slLastNodeId || ""
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas menu anchor read [${SL_DEBUG_BUILD}]: dom=${domAnchor} menu=${menuAnchor} focused=${focusedAnchor} last=${lastAnchor}`)
		return domAnchor || menuAnchor || focusedAnchor || lastAnchor || undefined
	}

	private getCanvasMenuDomAnchorNodeId(menu: HTMLElement): string {
		const direct = menu.closest<HTMLElement>("[data-node-id], [data-id]")
		const directId = direct ? this.extractCanvasDomNodeId(direct) : ""
		if (directId) {
			return directId
		}
		const explicitNodeAncestor = menu.parentElement?.querySelector<HTMLElement>("[data-node-id], [data-id]")
		const explicitId = explicitNodeAncestor ? this.extractCanvasDomNodeId(explicitNodeAncestor) : ""
		if (explicitId) {
			return explicitId
		}

		const container = menu.closest<HTMLElement>(".workspace-leaf-content, .view-content, .canvas-wrapper, .canvas")
			|| menu.parentElement
			|| menu.ownerDocument.body
		const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-node-id], [data-id]"))
			.filter((node) => !node.closest(".canvas-menu"))
			.filter((node) => this.extractCanvasDomNodeId(node).length > 0)
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas menu anchor dom-nearest candidates [${SL_DEBUG_BUILD}]: count=${nodes.length}`)
		if (nodes.length == 0) {
			return ""
		}

		const menuRect = menu.getBoundingClientRect()
		const menuCenterX = menuRect.left + (menuRect.width / 2)
		const menuCenterY = menuRect.top + (menuRect.height / 2)
		let bestId = ""
		let bestDistance = Number.POSITIVE_INFINITY
		for (const node of nodes) {
			const nodeId = this.extractCanvasDomNodeId(node)
			if (!nodeId) { continue }
			const rect = node.getBoundingClientRect()
			const centerX = rect.left + (rect.width / 2)
			const centerY = rect.top + (rect.height / 2)
			const distance = Math.hypot(centerX - menuCenterX, centerY - menuCenterY)
			if (distance < bestDistance) {
				bestDistance = distance
				bestId = nodeId
			}
		}
		if (bestId.length > 0) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas menu anchor dom-nearest: ${bestId} dist=${bestDistance.toFixed(1)}`)
		}
		return bestId
	}

	private extractCanvasDomNodeId(el: HTMLElement): string {
		const nodeId = el.getAttribute("data-node-id") || el.dataset.nodeId || ""
		if (nodeId.length > 0) {
			return nodeId
		}
		const dataId = el.getAttribute("data-id") || el.dataset.id || ""
		if (dataId.length == 0) {
			return ""
		}
		if (dataId.startsWith("edge-")) {
			return ""
		}
		return dataId
	}

	private bindCanvasMenuControlEvents(element: HTMLElement): void {
		const stop = (evt: Event) => {
			evt.stopPropagation()
		}
		element.addEventListener("pointerdown", stop)
		element.addEventListener("mousedown", stop)
		element.addEventListener("mouseup", stop)
		element.addEventListener("click", stop)
		element.addEventListener("dblclick", stop)
		element.addEventListener("keydown", stop)
	}

	private addCanvasMenuEdgeModeControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }
		if (!this.getFocusedCanvasEdge(container)) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-canvas-menu-edge-mode")) { return }
		if (!this.canvasEdgeModes.has(canvasFile.path)) {
			this.canvasEdgeModes.set(canvasFile.path, "as_Defined")
		}

		const section = document.createElement("div")
		section.className = "sl-canvas-menu-edge-mode"
		section.style.display = "flex"
		section.style.alignItems = "center"
		section.style.gap = "6px"
		section.style.marginLeft = "8px"

		const leftLabel = document.createElement("span")
		leftLabel.className = "sl-canvas-edge-mode-left-label"
		leftLabel.textContent = "defined"
		leftLabel.style.color = "#475569"
		leftLabel.style.fontSize = "11px"
		leftLabel.style.lineHeight = "1"
		section.appendChild(leftLabel)

		const toggle = document.createElement("button")
		toggle.className = "sl-canvas-edge-mode-toggle"
		toggle.type = "button"
		toggle.setAttribute("aria-label", "Toggle edge mode")
		toggle.style.position = "relative"
		toggle.style.width = "34px"
		toggle.style.height = "20px"
		toggle.style.padding = "0"
		toggle.style.borderRadius = "999px"
		toggle.style.border = "1px solid rgba(100, 116, 139, 0.35)"
		toggle.style.background = "#cbd5e1"
		toggle.style.cursor = "pointer"
		toggle.style.transition = "background 120ms ease"
		this.bindCanvasMenuControlEvents(toggle)

		const knob = document.createElement("span")
		knob.className = "sl-canvas-edge-mode-toggle-knob"
		knob.style.position = "absolute"
		knob.style.top = "1px"
		knob.style.left = "1px"
		knob.style.width = "16px"
		knob.style.height = "16px"
		knob.style.borderRadius = "999px"
		knob.style.background = "#ffffff"
		knob.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.18)"
		knob.style.transition = "transform 120ms ease"
		toggle.appendChild(knob)
		toggle.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const current = this.canvasEdgeModes.get(canvasFile.path) ?? "as_Defined"
			const next = current == "as_Defined" ? "as_calculated" : "as_Defined"
			this.canvasEdgeModes.set(canvasFile.path, next)
			this.updateCanvasEdgeModeControls(leaf)
			await this.applyCanvasEdgeModeToSelectedEdges(leaf, next)
		})
		section.appendChild(toggle)

		const rightLabel = document.createElement("span")
		rightLabel.className = "sl-canvas-edge-mode-right-label"
		rightLabel.textContent = "calculated"
		rightLabel.style.color = "#475569"
		rightLabel.style.fontSize = "11px"
		rightLabel.style.lineHeight = "1"
		section.appendChild(rightLabel)

		menu.appendChild(section)
	}

	private removeCanvasMenuEdgeModeControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		container.querySelector(".sl-canvas-menu-edge-mode")?.remove()
	}

	private addCanvasEdgeModeControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }
		const bar = this.ensureCanvasToolbar(leaf)
		if (bar.querySelector(".sl-canvas-edge-mode-bar")) { return }

		if (!this.canvasEdgeModes.has(canvasFile.path)) {
			this.canvasEdgeModes.set(canvasFile.path, "as_Defined")
		}

		const section = document.createElement("div")
		section.className = "sl-canvas-edge-mode-bar"
		section.style.display = "flex"
		section.style.alignItems = "center"
		section.style.gap = "6px"

		const label = document.createElement("span")
		label.className = "sl-canvas-edge-mode-left-label"
		label.textContent = "defined"
		label.style.color = "#475569"
		label.style.fontSize = "11px"
		label.style.lineHeight = "1"
		section.appendChild(label)

		const toggle = document.createElement("button")
		toggle.className = "sl-canvas-edge-mode-toggle"
		toggle.type = "button"
		toggle.setAttribute("aria-label", "Toggle edge mode")
		toggle.style.position = "relative"
		toggle.style.width = "34px"
		toggle.style.height = "20px"
		toggle.style.padding = "0"
		toggle.style.borderRadius = "999px"
		toggle.style.border = "1px solid rgba(100, 116, 139, 0.35)"
		toggle.style.background = "#cbd5e1"
		toggle.style.cursor = "pointer"
		toggle.style.transition = "background 120ms ease"

		const knob = document.createElement("span")
		knob.className = "sl-canvas-edge-mode-toggle-knob"
		knob.style.position = "absolute"
		knob.style.top = "1px"
		knob.style.left = "1px"
		knob.style.width = "16px"
		knob.style.height = "16px"
		knob.style.borderRadius = "999px"
		knob.style.background = "#ffffff"
		knob.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.18)"
		knob.style.transition = "transform 120ms ease"
		toggle.appendChild(knob)

		toggle.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const current = this.canvasEdgeModes.get(canvasFile.path) ?? "as_Defined"
			const next = current == "as_Defined" ? "as_calculated" : "as_Defined"
			this.canvasEdgeModes.set(canvasFile.path, next)
			this.updateCanvasEdgeModeControls(leaf)
			await this.applyCanvasEdgeModeToSelectedEdges(leaf, next)
		})

		section.appendChild(toggle)

		const rightLabel = document.createElement("span")
		rightLabel.className = "sl-canvas-edge-mode-right-label"
		rightLabel.textContent = "calculated"
		rightLabel.style.color = "#475569"
		rightLabel.style.fontSize = "11px"
		rightLabel.style.lineHeight = "1"
		section.appendChild(rightLabel)

		bar.appendChild(section)
		this.updateCanvasToolbarPosition(leaf)
	}

	private updateCanvasEdgeModeControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }
		const mode = this.canvasEdgeModes.get(canvasFile.path) ?? "as_Defined"
		const toggle = container.querySelector<HTMLElement>(".sl-canvas-edge-mode-toggle")
		const knob = container.querySelector<HTMLElement>(".sl-canvas-edge-mode-toggle-knob")
		const leftLabel = container.querySelector<HTMLElement>(".sl-canvas-edge-mode-left-label")
		const rightLabel = container.querySelector<HTMLElement>(".sl-canvas-edge-mode-right-label")
		if (toggle && knob) {
			const isCalculated = mode == "as_calculated"
			toggle.style.background = isCalculated ? "#cbd5e1" : "#64748b"
			knob.style.transform = isCalculated ? "translateX(14px)" : "translateX(0)"
			toggle.setAttribute("aria-pressed", isCalculated ? "true" : "false")
		}
		if (leftLabel) {
			leftLabel.style.color = mode == "as_Defined" ? "#0f172a" : "#64748b"
		}
		if (rightLabel) {
			rightLabel.style.color = mode == "as_calculated" ? "#0f172a" : "#64748b"
		}
		this.updateCanvasToolbarPosition(leaf)
	}

	private updateCanvasToolbarVisibility(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const bar = container.querySelector<HTMLElement>(".sl-canvas-toolbar")
		if (!bar) { return }
		bar.style.display = (this.getFocusedCanvasNode(container) || this.getFocusedCanvasEdge(container)) ? "none" : "flex"
	}

	private ensureCanvasToolbar(leaf: WorkspaceLeaf): HTMLElement {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		let bar = container?.querySelector<HTMLElement>(".sl-canvas-toolbar")
		if (container && !bar) {
			const menu = container.querySelector<HTMLElement>(".canvas-menu")
			const host = menu?.parentElement ?? container
			bar = document.createElement("div")
			bar.className = "sl-canvas-toolbar"
			bar.style.display = "flex"
			bar.style.alignItems = "center"
			bar.style.gap = "10px"
			bar.style.marginRight = "8px"
			bar.style.padding = "4px 8px"
			bar.style.borderRadius = "999px"
			bar.style.background = "rgba(255, 255, 255, 0.72)"
			bar.style.border = "1px solid rgba(148, 163, 184, 0.5)"
			bar.style.boxShadow = "0 1px 4px rgba(15, 23, 42, 0.08)"
			bar.style.setProperty("backdrop-filter", "blur(3px)")
			if (menu) {
				host.insertBefore(bar, menu)
			} else {
				host.appendChild(bar)
			}
		}
		return bar as HTMLElement
	}

	private updateCanvasToolbarPosition(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const bar = container.querySelector<HTMLElement>(".sl-canvas-toolbar")
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!bar || !menu) { return }
		if (bar.parentElement !== menu.parentElement) {
			menu.parentElement?.insertBefore(bar, menu)
		}
	}

	private async updateCanvasInfoButton(leaf: WorkspaceLeaf): Promise<void> {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const btn = container.querySelector<HTMLElement>(".sl-node-info-btn")
		if (!btn) { return }
		const focused = this.getFocusedCanvasNode(container)
		if (!focused) {
			btn.style.display = "none"
			return
		}
		const maps = await this.loadCanvasNodeFileMaps(canvasFile)
		const res = this.resolveCanvasNodeFiles(focused, maps)
		btn.style.display = res.dataPath ? "" : "none"
	}

	private resolveCanvasNodeFiles(
		focused: HTMLElement,
		maps: { idMap: Map<string, string>; textMap: Map<string, string>; dataIdMap: Map<string, string>; dataTextMap: Map<string, string>; idTextMap: Map<string, string>; dataIdTextMap: Map<string, string> }
	): { dataPath?: string; linkedPath?: string; nodeText: string } {
		let dataPath: string | undefined
		let linkedPath: string | undefined
		let nodeText = ""
		const id = focused.getAttribute("data-node-id") || focused.getAttribute("data-id") || focused.dataset.nodeId || focused.dataset.id
		if (id) {
			dataPath = maps.dataIdMap.get(id)
			linkedPath = maps.idMap.get(id)
		}
		if (!dataPath && !linkedPath) {
			const textEl = focused.querySelector<HTMLElement>(".canvas-node-content .markdown-preview-view h1, .canvas-node-content .markdown-preview-view h2, .canvas-node-content .markdown-preview-view h3, .canvas-node-content .markdown-preview-view h4, .canvas-node-content .markdown-preview-view h5, .canvas-node-content .markdown-preview-view h6, .canvas-node-content .markdown-preview-view p, .canvas-node-content textarea, .canvas-node-content")
			nodeText = textEl?.textContent?.trim() ?? ""
			if (!nodeText) {
				const iframe = focused.querySelector<HTMLIFrameElement>("iframe.embed-iframe")
				const doc = iframe?.contentDocument
				const heading = doc?.querySelector("h1, h2, h3, h4, h5, h6")
				const p = doc?.querySelector("p")
				nodeText = (heading?.textContent || p?.textContent || "").trim()
			}
			if (nodeText.length > 0) {
				const normalized = this.extractNodeIdText(nodeText)
				dataPath = maps.dataTextMap.get(nodeText) ?? maps.dataIdTextMap.get(normalized)
				linkedPath = maps.textMap.get(nodeText) ?? maps.idTextMap.get(normalized)
			}
		}
		return { dataPath, linkedPath, nodeText }
	}

	private extractNodeIdText(raw: string): string {
		if (!raw) { return "" }
		const match = raw.match(/NodeID:\s*([^\n\r]+)/i)
		if (match && match[1]) {
			const chunk = match[1].trim()
			const stop = chunk.split(/CONCEPT:|ERROR:|OR_MIN:|OR_MAX:/i)[0].trim()
			return stop
		}
		return raw.split(/[\r\n]/)[0].trim()
	}

	private extractCanvasNodeFieldValue(raw: string, fieldName: string): string {
		if (!raw) { return "" }
		const regex = new RegExp(`^${fieldName}:\\s*(.*)$`, "im")
		const match = raw.match(regex)
		return match?.[1]?.trim() ?? ""
	}

	private getFocusedCanvasNode(container: HTMLElement): HTMLElement | null {
		return container.querySelector<HTMLElement>(
			".canvas-node.is-focused, .canvas-node.is-selected, .canvas-node.is-editing"
		)
	}

	private getFocusedCanvasEdge(container: HTMLElement): HTMLElement | null {
		return container.querySelector<HTMLElement>(
			".canvas-edge.is-focused, .canvas-edge.is-selected"
		)
	}

	private async insertCanvasNode(leaf: WorkspaceLeaf, nodeType: CanvasNodeInsertType, anchorNodeId?: string): Promise<void> {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }

		const data = await this.readCanvasFileData(canvasFile)
		const anchorId = anchorNodeId ?? this.getFocusedCanvasNodeId(container)
		const anchorNode = anchorId ? data.nodes.find((node) => node.id == anchorId) : undefined
		const suggestedId = this.suggestCanvasNodeId(nodeType, anchorNode, data.nodes)
		const requestedId = await this.promptCanvasNodeId(nodeType, suggestedId)
		if (!requestedId) {
			new Notice("Node insertion cancelled.")
			return
		}
		if (data.nodes.some((node) => node.id == requestedId)) {
			new Notice("This node ID already exists.")
			return
		}

		const orConfig = nodeType == "OR" ? await this.promptCanvasOrConfig() : undefined
		if (nodeType == "OR" && !orConfig) {
			new Notice("OR insertion cancelled.")
			return
		}

		const nextNode = this.buildCanvasNode(nodeType, requestedId, anchorNode, { orConfig })
		data.nodes.push(nextNode)
		if (anchorNode) {
			data.edges.push(this.buildCanvasEdge(anchorNode, nextNode, data.edges, this.canvasEdgeModes.get(canvasFile.path) ?? "as_Defined"))
		}

		await this.writeCanvasFileData(canvasFile, data)
		await leaf.openFile(canvasFile, { active: false })
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas node inserted: ${nodeType} (${nextNode.id})`)
	}

	private async promptCanvasNodeId(nodeType: CanvasNodeInsertType, suggestedId: string): Promise<string | undefined> {
		return await new Promise((resolve) => {
			const modal = new CanvasNodeIdModal(this.app, nodeType, suggestedId, resolve)
			modal.open()
		})
	}

	private async promptCanvasOrConfig(): Promise<CanvasOrConfig | undefined> {
		return await new Promise((resolve) => {
			const modal = new CanvasOrConfigModal(this.app, resolve)
			modal.open()
		})
	}

	private async changeCanvasNodeConcept(leaf: WorkspaceLeaf, nodeId: string, nodeType: CanvasNodeInsertType): Promise<void> {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }

		const data = await this.readCanvasFileData(canvasFile)
		const node = data.nodes.find((entry) => entry.id == nodeId)
		if (!node) {
			new Notice("Selected node could not be found.")
			return
		}

		const contentConfig = await this.getCanvasNodeContentConfig(nodeType, node.text ?? "")
		if (nodeType == "OR" && !contentConfig.orConfig) {
			new Notice("Change cancelled.")
			return
		}

		const dimensions = this.getCanvasNodeDimensions(nodeType)
		node.width = dimensions.width
		node.height = dimensions.height
		node.color = this.getCanvasNodeColor(nodeType)
		node.text = this.buildCanvasNodeText(nodeType, node.id, contentConfig)

		await this.writeCanvasFileData(canvasFile, data)
		await leaf.openFile(canvasFile, { active: false })
	}

	private async getCanvasNodeContentConfig(nodeType: CanvasNodeInsertType, existingText: string): Promise<CanvasNodeContentConfig> {
		if (nodeType == "OR") {
			const orConfig = await this.promptCanvasOrConfig()
			return { orConfig }
		}
		if (nodeType == "ATTRIBUTE") {
			return { value: this.extractCanvasNodeFieldValue(existingText, "Value") }
		}
		return {}
	}

	private getFocusedCanvasNodeId(container: HTMLElement): string | undefined {
		const focused = this.getFocusedCanvasNode(container)
		return focused?.getAttribute("data-node-id")
			|| focused?.getAttribute("data-id")
			|| focused?.dataset.nodeId
			|| focused?.dataset.id
			|| undefined
	}

	private getSelectedCanvasNodeIds(container: HTMLElement): string[] {
		const focusedId = this.getFocusedCanvasNodeId(container)
		const ids: string[] = []
		if (focusedId) {
			ids.push(focusedId)
		}
		const selectedNodes = Array.from(container.querySelectorAll<HTMLElement>(".canvas-node.is-selected, .canvas-node.is-focused, .canvas-node.is-editing"))
		for (const node of selectedNodes) {
			const id = node.getAttribute("data-node-id") || node.getAttribute("data-id") || node.dataset.nodeId || node.dataset.id
			if (id && !ids.includes(id)) {
				ids.push(id)
			}
		}
		return ids.slice(0, 2)
	}

	private getSelectedCanvasEdgeIds(container: HTMLElement): string[] {
		const ids: string[] = []
		const selectedEdges = Array.from(container.querySelectorAll<HTMLElement>(".canvas-edge.is-selected, .canvas-edge.is-focused"))
		for (const edge of selectedEdges) {
			const id = edge.getAttribute("data-edge-id") || edge.getAttribute("data-id") || edge.dataset.edgeId || edge.dataset.id
			if (id && !ids.includes(id)) {
				ids.push(id)
			}
		}
		return ids
	}

	private async applyCanvasEdgeModeToSelectedEdges(leaf: WorkspaceLeaf, mode: CanvasEdgeInsertType): Promise<void> {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }

		const selectedEdgeIds = this.getSelectedCanvasEdgeIds(container)
		if (selectedEdgeIds.length == 0) { return }

		const data = await this.readCanvasFileData(canvasFile)
		let changed = false
		for (const edge of data.edges) {
			if (!selectedEdgeIds.includes(edge.id)) { continue }
			if (this.getCanvasEdgeRelationType(edge) == mode && edge.color == this.getCanvasEdgeColor(mode)) { continue }
			edge.meta = { ...(edge.meta ?? {}), SL_RelationType: mode }
			edge.color = this.getCanvasEdgeColor(mode)
			changed = true
		}
		if (!changed) { return }

		await this.writeCanvasFileData(canvasFile, data)
		await leaf.openFile(canvasFile, { active: false })
	}

	private buildCanvasNode(nodeType: CanvasNodeInsertType, nodeId: string, anchorNode: CanvasFileNode | undefined, contentConfig?: CanvasNodeContentConfig): CanvasFileNode {
		const dimensions = this.getCanvasNodeDimensions(nodeType)
		const originX = anchorNode?.x ?? 0
		const originY = anchorNode?.y ?? 0
		const originWidth = anchorNode?.width ?? 260
		const originHeight = anchorNode?.height ?? 100
		const nodeX = anchorNode
			? (nodeType == "LEAF" ? originX + originWidth + 120 : originX)
			: originX
		const nodeY = anchorNode
			? (nodeType == "LEAF" ? originY : originY + originHeight + 120)
			: originY

		return {
			id: nodeId,
			type: "text",
			text: this.buildCanvasNodeText(nodeType, nodeId, contentConfig),
			x: nodeX,
			y: nodeY,
			width: dimensions.width,
			height: dimensions.height,
			color: this.getCanvasNodeColor(nodeType)
		}
	}

	private suggestCanvasNodeId(nodeType: CanvasNodeInsertType, anchorNode: CanvasFileNode | undefined, existingNodes: CanvasFileNode[]): string {
		const existingIds = new Set(existingNodes.map((node) => node.id))
		const baseId = this.getCanvasBaseNodeId(nodeType, anchorNode?.id)
		return this.createUniqueCanvasId(baseId, existingIds)
	}

	private getCanvasBaseNodeId(nodeType: CanvasNodeInsertType, anchorId: string | undefined): string {
		if (nodeType == "SYMBOL") {
			return anchorId ? `${anchorId}.symbol` : "NewSymbol"
		}
		if (nodeType == "ATTRIBUTE") {
			return anchorId ? `${anchorId}.Attribute` : "NewAttribute"
		}
		if (anchorId && nodeType == "LEAF") {
			return `${anchorId}.leaf`
		}
		if (anchorId) {
			return `${anchorId}.${nodeType.toLowerCase()}`
		}
		return `New${nodeType}`
	}

	private buildCanvasNodeText(nodeType: CanvasNodeInsertType, nodeId: string, contentConfig?: CanvasNodeContentConfig): string {
		const lines = [`ID: ${nodeId}`, `Concept: ${nodeType}`]
		switch (nodeType) {
			case "SYMBOL":
				break
			case "AND":
				break
			case "OR":
				lines.push(`Min: ${contentConfig?.orConfig?.min ?? "1"}`)
				lines.push(`Max: ${contentConfig?.orConfig?.max ?? "1"}`)
				break
			case "LEAF":
				break
			case "ATTRIBUTE":
				lines.push(`Value: ${contentConfig?.value ?? ""}`)
				break
		}
		return lines.join("\n")
	}

	private getCanvasNodeDimensions(nodeType: CanvasNodeInsertType): { width: number; height: number } {
		switch (nodeType) {
			case "SYMBOL":
				return { width: 300, height: 60 }
			case "AND":
				return { width: 300, height: 100 }
			case "OR":
				return { width: 300, height: 140 }
			case "LEAF":
				return { width: 300, height: 60 }
			case "ATTRIBUTE":
				return { width: 300, height: 80 }
		}
	}

	private getCanvasNodeColor(nodeType: CanvasNodeInsertType): string {
		switch (nodeType) {
			case "SYMBOL":
				return "#1d4ed8"
			case "AND":
				return "#7e22ce"
			case "OR":
				return "#4ade80"
			case "LEAF":
				return "#fed7aa"
			case "ATTRIBUTE":
				return "#fef9c3"
		}
	}

	private getCanvasEdgeColor(edgeType: CanvasEdgeInsertType): string {
		switch (edgeType) {
			case "as_Defined":
				return "#4b5563"
			case "as_calculated":
				return "#d1d5db"
		}
	}

	private getCanvasEdgeRelationType(edge: CanvasFileEdge): CanvasEdgeInsertType | undefined {
		const relation = String(edge.meta?.SL_RelationType ?? "")
		return relation == "as_Defined" || relation == "as_calculated"
			? relation
			: undefined
	}

	private getCanvasEdgeSides(sourceNode: CanvasFileNode, targetNode: CanvasFileNode): { fromSide: string; toSide: string } {
		const sourceCenterX = sourceNode.x + ((sourceNode.width ?? 260) / 2)
		const sourceCenterY = sourceNode.y + ((sourceNode.height ?? 100) / 2)
		const targetCenterX = targetNode.x + ((targetNode.width ?? 260) / 2)
		const targetCenterY = targetNode.y + ((targetNode.height ?? 100) / 2)
		const deltaX = targetCenterX - sourceCenterX
		const deltaY = targetCenterY - sourceCenterY

		if (Math.abs(deltaX) >= Math.abs(deltaY)) {
			return deltaX >= 0
				? { fromSide: "right", toSide: "left" }
				: { fromSide: "left", toSide: "right" }
		}

		return deltaY >= 0
			? { fromSide: "bottom", toSide: "top" }
			: { fromSide: "top", toSide: "bottom" }
	}

	private buildCanvasEdge(sourceNode: CanvasFileNode, targetNode: CanvasFileNode, existingEdges: CanvasFileEdge[], edgeType: CanvasEdgeInsertType): CanvasFileEdge {
		const sides = this.getCanvasEdgeSides(sourceNode, targetNode)
		const edgeId = this.createUniqueCanvasId(
			`${sourceNode.id}->${targetNode.id}`,
			new Set(existingEdges.map((edge) => edge.id))
		)
		return {
			id: edgeId,
			fromNode: sourceNode.id,
			fromSide: sides.fromSide,
			toNode: targetNode.id,
			toSide: sides.toSide,
			color: this.getCanvasEdgeColor(edgeType),
			meta: {
				SL_RelationType: edgeType
			}
		}
	}

	private createUniqueCanvasId(baseId: string, existingIds: Set<string>): string {
		if (!existingIds.has(baseId)) {
			return baseId
		}
		let counter = 2
		while (existingIds.has(`${baseId}.${counter}`)) {
			counter++
		}
		return `${baseId}.${counter}`
	}

	private async readCanvasFileData(canvasFile: TFile): Promise<CanvasFileData> {
		let raw = ""
		try {
			raw = await this.app.vault.cachedRead(canvasFile)
		} catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Canvas read failed: ${canvasFile.path}`)
			return { nodes: [], edges: [] }
		}

		try {
			const parsed = JSON.parse(raw)
			const data = {
				nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
				edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
				files: Array.isArray(parsed?.files) ? parsed.files : undefined
			}
			if (!this.canvasKnownEdgeIds.has(canvasFile.path)) {
				this.canvasKnownEdgeIds.set(canvasFile.path, new Set(data.edges.map((edge: CanvasFileEdge) => edge.id)))
			}
			return data
		} catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Canvas parse failed: ${canvasFile.path}`)
			return { nodes: [], edges: [] }
		}
	}

	private async writeCanvasFileData(canvasFile: TFile, data: CanvasFileData): Promise<void> {
		const payload = JSON.stringify(data, null, 2)
		this.canvasEdgeModeWriteInFlight.add(canvasFile.path)
		try {
			await this.app.vault.modify(canvasFile, payload)
			this.canvasNodeFileCache.delete(canvasFile.path)
			this.canvasKnownEdgeIds.set(canvasFile.path, new Set(data.edges.map((edge: CanvasFileEdge) => edge.id)))
		} finally {
			window.setTimeout(() => {
				this.canvasEdgeModeWriteInFlight.delete(canvasFile.path)
			}, 50)
		}
	}

	private async syncNewCanvasEdgesToMode(canvasFile: TFile): Promise<void> {
		const path = normalizePath(canvasFile.path)
		if (this.canvasEdgeModeWriteInFlight.has(path)) { return }
		const mode = this.canvasEdgeModes.get(path)
		if (!mode) { return }

		const previousEdgeIds = this.canvasKnownEdgeIds.get(path)
		const data = await this.readCanvasFileData(canvasFile)
		const currentEdgeIds = new Set(data.edges.map((edge) => edge.id))
		if (!previousEdgeIds) {
			this.canvasKnownEdgeIds.set(path, currentEdgeIds)
			return
		}

		let changed = false
		for (const edge of data.edges) {
			if (previousEdgeIds.has(edge.id)) { continue }
			edge.meta = { ...(edge.meta ?? {}), SL_RelationType: mode }
			edge.color = this.getCanvasEdgeColor(mode)
			changed = true
		}

		this.canvasKnownEdgeIds.set(path, currentEdgeIds)
		if (!changed) { return }
		await this.writeCanvasFileData(canvasFile, data)
	}

	async activateASPView() {
		// Add the ASP - View
		// Check if there is a ASPView
		if (this.slComm.slaspview == undefined) {
			this.registerView(
				ASPViewType,
				leaf => new ASPView(leaf)
			);
		}

		const leaf = this.GetAspLeaf();
		if (leaf != undefined) {
			leaf.setViewState({
				type: ASPViewType,
				active: false,
			})
			await this.semaLogicReset()
			this.app.workspace.revealLeaf(leaf);
		} else {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "ASP-Leaf not created")
		}
		this.setViews()
		this.handlePing()
		this.statusTransfer = true
		this.semaLogicUpdate()
		this.myStatus.setText('ASP is on');
	}

	async activateKnowledgeView() {
		slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm?.slview, 'Activate KnowledgeView')
		await this.openKnowledgeCanvas()
		this.setViews()
		this.handlePing()
		this.semaLogicUpdate()
		this.myStatus.setText('Knowledge is on');
	}

	async activateView() {
		// Add the SemaLogic - View
		if (this.slComm.slview == undefined) {
			this.registerView(
				SemaLogicViewType,
				leaf => new SemaLogicView(leaf)
			);
		}

		const leaf = this.GetSemaLogicLeaf();
		if (leaf != undefined) {
			leaf.setViewState({
				type: SemaLogicViewType,
				active: false,
			})
			await this.semaLogicReset()
			this.app.workspace.revealLeaf(leaf);
		} else {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "SemaLogic-Leaf not created")
		}
		this.setViews()
		this.handlePing()
		if (this.slComm.slview != undefined) {
			this.semaLogicUpdate()
		}
		this.pluginEnabled = true
		this.statusSL = true
		this.myStatus.setText('SemaLogic is on');
	}

	async deactivateASPView() {
		this.app.workspace.detachLeavesOfType(ASPViewType);
		this.slComm.activatedASP = false
		this.statusTransfer = true
		this.myStatus.setText('ASP is off');
	}

	async deactivateKnowledgeView() {
		this.detachKnowledgeCanvasLeaves()
		this.slComm.activatedKnowledge = false
		this.myStatus.setText('Knowledge is off');
	}

	async deactivateView() {
		this.app.workspace.detachLeavesOfType(SemaLogicViewType);
		this.activated = false
		this.pluginEnabled = false
		this.statusSL = false
		this.slComm.slview.unload()
		this.myStatus.setText('SemaLogic is off');
	}

	GetAspLeaf(): WorkspaceLeaf | undefined {
		let found: boolean = false
		let slv: WorkspaceLeaf | undefined = undefined

		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!found) {
				switch (leaf.view.getViewType()) {
					case ASPViewType: {
						found = true
						slv = leaf
						//return slv
					}
				}
			}
		})
		if (!found && this.app.workspace.layoutReady) {
			slconsolelog(DebugLevMap.DebugLevel_All, undefined, 'Split')
			slv = this.app.workspace.getLeaf('split');
			slconsolelog(DebugLevMap.DebugLevel_All, undefined, slv)
		}
		return slv
	}

	GetSemaLogicLeaf(): WorkspaceLeaf | undefined {
		let found: boolean = false
		let slv: WorkspaceLeaf | undefined = undefined

		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!found) {
				switch (leaf.view.getViewType()) {
					case SemaLogicViewType: {
						found = true
						slv = leaf
						//return slv
					}
				}
			}
		})
		if (!found && this.app.workspace.layoutReady) {
			slconsolelog(DebugLevMap.DebugLevel_All, undefined, 'Split')
			slv = this.app.workspace.getLeaf('split');
			slconsolelog(DebugLevMap.DebugLevel_All, undefined, slv)
		}
		return slv
	}

	private async ensureKnowledgeCanvasFile(content?: string): Promise<TFile> {
		const path = normalizePath(this.knowledgeCanvasPath)
		const folder = path.split("/").slice(0, -1).join("/")
		if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
			await this.app.vault.createFolder(folder)
		}
		let file = this.app.vault.getAbstractFileByPath(path)
		if (file == null) {
			file = await this.app.vault.create(path, content ?? "{ \"nodes\": [], \"edges\": [] }")
		} else if (content != undefined) {
			await this.app.vault.adapter.write(path, content)
			await this.app.vault.modify(file as TFile, content)
		}
		return file as TFile
	}

	private findKnowledgeCanvasLeaf(): WorkspaceLeaf | undefined {
		let found: WorkspaceLeaf | undefined = undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found != undefined) { return }
			if (leaf.view.getViewType() == "canvas") {
				const file = (leaf.view as any).file as TFile | undefined
				if (file != undefined && normalizePath(file.path) == normalizePath(this.knowledgeCanvasPath)) {
					found = leaf
				}
			}
		})
		if (found != undefined) {
			this.knowledgeLeaf = found
		}
		return found
	}

	private detachKnowledgeCanvasLeaves(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() == "canvas") {
				const file = (leaf.view as any).file as TFile | undefined
				if (file != undefined && normalizePath(file.path) == normalizePath(this.knowledgeCanvasPath)) {
					leaf.detach()
				}
			}
		})
		this.knowledgeLeaf = undefined
	}

	private async openKnowledgeCanvas(): Promise<void> {
		const file = await this.ensureKnowledgeCanvasFile()
		let leaf = this.findKnowledgeCanvasLeaf()
		if (leaf == undefined) {
			leaf = this.app.workspace.getLeaf('split')
		}
		this.knowledgeLeaf = leaf
		await leaf.openFile(file, { active: false })
		this.attachCanvasTooltips(leaf)
		this.slComm.activatedKnowledge = true
	}

	public async updateKnowledgeCanvas(content: string): Promise<void> {
		slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, `Update KnowledgeCanvas (len=${content?.length ?? 0})`)
		await this.processCanvasResponse(content, this.knowledgeCanvasPath, false)
		const file = await this.ensureKnowledgeCanvasFile()
		let leaf = this.knowledgeLeaf
		if (leaf == undefined) {
			leaf = this.findKnowledgeCanvasLeaf()
		}
		if (leaf != undefined) {
			this.knowledgeLeaf = leaf
			await leaf.openFile(file, { active: false })
			this.attachCanvasTooltips(leaf)
		}
	}

	private async ensureKnowledgeEditCanvasFile(content?: string): Promise<TFile> {
		const path = normalizePath(this.knowledgeEditCanvasPath)
		const folder = path.split("/").slice(0, -1).join("/")
		if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
			await this.app.vault.createFolder(folder)
		}
		let file = this.app.vault.getAbstractFileByPath(path)
		if (file == null) {
			file = await this.app.vault.create(path, content ?? "{ \"nodes\": [], \"edges\": [] }")
		} else if (content != undefined) {
			await this.app.vault.adapter.write(path, content)
			await this.app.vault.modify(file as TFile, content)
		}
		return file as TFile
	}

	private findKnowledgeEditLeaf(): WorkspaceLeaf | undefined {
		let found: WorkspaceLeaf | undefined = undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found != undefined) { return }
			if (leaf.view.getViewType() == "canvas") {
				const file = (leaf.view as any).file as TFile | undefined
				if (file != undefined && normalizePath(file.path) == normalizePath(this.knowledgeEditCanvasPath)) {
					found = leaf
				}
			}
		})
		if (found != undefined) {
			this.knowledgeEditLeaf = found
		}
		return found
	}

	private detachKnowledgeEditCanvasLeaves(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() == "canvas") {
				const file = (leaf.view as any).file as TFile | undefined
				if (file != undefined && normalizePath(file.path) == normalizePath(this.knowledgeEditCanvasPath)) {
					leaf.detach()
				}
			}
		})
		this.knowledgeEditLeaf = undefined
	}

	private async openKnowledgeEditCanvas(): Promise<void> {
		const file = await this.ensureKnowledgeEditCanvasFile()
		let leaf = this.findKnowledgeEditLeaf()
		if (leaf == undefined) {
			leaf = this.app.workspace.getLeaf('split')
		}
		this.knowledgeEditLeaf = leaf
		await leaf.openFile(file, { active: false })
		this.attachCanvasTooltips(leaf)
	}

	private async ensureSemaLogicViewForRequest(): Promise<boolean> {
		if (this.slComm?.slview != undefined) {
			return true
		}
		await this.activateView()
		return this.slComm?.slview != undefined
	}

	private async tickKnowledgeEdit(): Promise<void> {
		if (!this.pauseAllRequests || this.knowledgeEditSelection == undefined) { return }
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "KnowledgeEdit tick")
		const file = await this.ensureKnowledgeEditCanvasFile()
		const content = await this.app.vault.adapter.read((file as TFile).path)
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `KnowledgeEdit canvas len=${content.length}`)
		if (content == this.knowledgeEditLastCanvas) { return }
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "KnowledgeEdit canvas changed")
		this.knowledgeEditLastCanvas = content

		const vAPI_URL = getHostPort(this.settings) + "/canvas/convert";
		const response = await this.requestCanvasConvert(vAPI_URL, content)
		if (response == undefined || response.length == 0) { return }

		const sel = this.knowledgeEditSelection
		const editor = sel.view.editor
		const current = editor.getRange(sel.from, sel.to)
		if (current != sel.original) {
			slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, "KnowledgeEdit: selection changed, skip replace")
			return
		}

		editor.replaceRange(response, sel.from, sel.to)
		const fromOffset = editor.posToOffset(sel.from)
		sel.to = editor.offsetToPos(fromOffset + response.length)
		sel.original = response

		this.pauseAllRequests = false
		this.semaLogicUpdate()
		this.pauseAllRequests = true
	}

	public async startKnowledgeEdit(view: MarkdownView, selection: string): Promise<void> {
		if (!this.pluginEnabled || selection.length == 0) { return }
		if (!(await this.ensureSemaLogicViewForRequest())) { return }
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "Start KnowledgeEdit")
		const existingAnchor = this.extractSLInterpreterAnchorData(selection)
		const normalizedSelection = existingAnchor?.slText || existingAnchor?.visibleText || selection
		const selectionRange = existingAnchor != undefined
			? this.findSLInterpreterSelectionForAnchor(view, existingAnchor.visibleText, existingAnchor.slText)
			: this.findTextSelectionRange(view, selection)
		this.pauseAllRequests = true
		this.updateOutstanding = false
		this.updateTransferOutstanding = false

		this.knowledgeEditLastCanvas = ""
		const from = selectionRange?.from ?? view.editor.getCursor("from")
		const to = selectionRange?.to ?? view.editor.getCursor("to")
		this.knowledgeEditSelection = { view, from, to, original: selection }

		const vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + mygSID;
		const response = await this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, "default", normalizedSelection, true, RulesettypesCommands[Rstypes_KnowledgeGraph][1])
		await this.processCanvasResponse(response, this.knowledgeEditCanvasPath, false)
		await this.openKnowledgeEditCanvas()

		if (this.knowledgeEditInterval != undefined) {
			window.clearInterval(this.knowledgeEditInterval)
			this.knowledgeEditInterval = undefined
		}
	}

	public async stopKnowledgeEdit(): Promise<void> {
		if (this.knowledgeEditInterval != undefined) {
			window.clearInterval(this.knowledgeEditInterval)
			this.knowledgeEditInterval = undefined
		}
		if (this.knowledgeEditDebounce != undefined) {
			window.clearTimeout(this.knowledgeEditDebounce)
			this.knowledgeEditDebounce = undefined
		}
		this.detachKnowledgeEditCanvasLeaves()
		const file = this.app.vault.getAbstractFileByPath(normalizePath(this.knowledgeEditCanvasPath))
		if (file != undefined) {
			await this.app.vault.delete(file)
		}
		this.knowledgeEditLastCanvas = ""
		this.knowledgeEditSelection = undefined
		this.pauseAllRequests = false
	}

	private async ensureInterpreterCanvasFile(content?: string): Promise<TFile> {
		const path = normalizePath(this.interpreterCanvasPath)
		const folder = path.split("/").slice(0, -1).join("/")
		if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
			await this.app.vault.createFolder(folder)
		}
		let file = this.app.vault.getAbstractFileByPath(path)
		if (file == null) {
			file = await this.app.vault.create(path, content ?? "{ \"nodes\": [], \"edges\": [] }")
		} else if (content != undefined) {
			await this.app.vault.adapter.write(path, content)
			await this.app.vault.modify(file as TFile, content)
		}
		return file as TFile
	}

	private findInterpreterLeaf(): WorkspaceLeaf | undefined {
		let found: WorkspaceLeaf | undefined = undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found != undefined) { return }
			if (leaf.view.getViewType() == "canvas") {
				const file = (leaf.view as any).file as TFile | undefined
				if (file != undefined && normalizePath(file.path) == normalizePath(this.interpreterCanvasPath)) {
					found = leaf
				}
			}
		})
		if (found != undefined) {
			this.interpreterLeaf = found
		}
		return found
	}

	private detachInterpreterCanvasLeaves(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() == "canvas") {
				const file = (leaf.view as any).file as TFile | undefined
				if (file != undefined && normalizePath(file.path) == normalizePath(this.interpreterCanvasPath)) {
					leaf.detach()
				}
			}
		})
		this.interpreterLeaf = undefined
	}

	private async openInterpreterCanvas(): Promise<void> {
		const file = await this.ensureInterpreterCanvasFile()
		let leaf = this.findInterpreterLeaf()
		if (leaf == undefined) {
			leaf = this.app.workspace.getLeaf('split')
		}
		this.interpreterLeaf = leaf
		await leaf.openFile(file, { active: false })
		this.attachCanvasTooltips(leaf)
	}

	private async tickSLInterpreter(): Promise<void> {
		if (!this.pauseAllRequests || this.interpreterSelection == undefined) { return }
		const file = await this.ensureInterpreterCanvasFile()
		const content = await this.app.vault.adapter.read((file as TFile).path)
		if (content == this.interpreterLastCanvas) { return }
		this.interpreterLastCanvas = content

		const vAPI_URL = getHostPort(this.settings) + "/canvas/convert";
		const response = await this.requestCanvasConvert(vAPI_URL, content)
		if (response == undefined || response.length == 0) { return }

		const sel = this.interpreterSelection
		const editor = sel.view.editor
		const current = editor.getRange(sel.from, sel.to)
		if (current != sel.original) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "SL-Interpreter: selection changed, skip replace")
			return
		}

		const trailingMatch = sel.sourceText.match(/\s+$/)
		const trailingSpace = trailingMatch ? trailingMatch[0] : ""
		const baseOriginal = trailingSpace.length > 0 ? sel.sourceText.slice(0, -trailingSpace.length) : sel.sourceText
		let spacer = trailingSpace
		if (spacer.length == 0) {
			const nextChar = editor.getRange(sel.to, { line: sel.to.line, ch: sel.to.ch + 1 })
			if (nextChar && !/\s/.test(nextChar)) {
				spacer = " "
			}
		}
		const newText = this.buildSLInterpreterAnchor(baseOriginal, response) + spacer
		editor.replaceRange(newText, sel.from, sel.to)
		const fromOffset = editor.posToOffset(sel.from)
		sel.to = editor.offsetToPos(fromOffset + newText.length)
		sel.original = newText

		this.pauseAllRequests = false
		this.semaLogicUpdate()
		this.pauseAllRequests = true
	}

	public async startSLInterpreter(view: MarkdownView, selection: string): Promise<void> {
		const existingAnchor = this.extractSLInterpreterAnchorData(selection)
		const normalizedSelection = existingAnchor?.visibleText ?? selection
		const existingSLText = existingAnchor?.slText ?? ""
		const anchorSelection = existingAnchor != undefined
			? this.findSLInterpreterSelectionForAnchor(view, existingAnchor.visibleText, existingAnchor.slText)
			: undefined
		const textSelection = anchorSelection == undefined ? this.findTextSelectionRange(view, normalizedSelection) : undefined
		const from = anchorSelection?.from ?? textSelection?.from ?? view.editor.getCursor("from")
		const to = anchorSelection?.to ?? textSelection?.to ?? view.editor.getCursor("to")
		if (existingSLText.length > 0) {
			await this.startSLInterpreterFromSLText(normalizedSelection, existingSLText, { view, from, to })
			return
		}
		await this.startSLInterpreterFromText(normalizedSelection, { view, from, to })
	}

	public async stopSLInterpreter(): Promise<void> {
		if (this.interpreterInterval != undefined) {
			window.clearInterval(this.interpreterInterval)
			this.interpreterInterval = undefined
		}
		if (this.interpreterDebounce != undefined) {
			window.clearTimeout(this.interpreterDebounce)
			this.interpreterDebounce = undefined
		}
		this.detachInterpreterCanvasLeaves()
		const file = this.app.vault.getAbstractFileByPath(normalizePath(this.interpreterCanvasPath))
		if (file != undefined) {
			await this.app.vault.delete(file)
		}
		this.interpreterLastCanvas = ""
		this.interpreterSelection = undefined
		this.pauseAllRequests = false
	}


	private async requestCanvasConvert(apiUrl: string, canvasJson: string): Promise<string> {
		let body = ""
		try {
			let parsed: any
			try {
				parsed = JSON.parse(canvasJson)
			} catch (e) {
				slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Canvas2SL invalid JSON: ${e}`)
				return ""
			}
			body = JSON.stringify(parsed)
			const nodesCount = Array.isArray(parsed?.nodes) ? parsed.nodes.length : 0
			const edgesCount = Array.isArray(parsed?.edges) ? parsed.edges.length : 0
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas2SL request len=${body.length} nodes=${nodesCount} edges=${edgesCount}`)
			const response = await requestUrl({
				url: apiUrl,
				method: "POST",
				headers: {
					"content-type": "text/plain",
					"accept": "text/plain, application/json"
				},
				body
			})
			if (response.status == 200) {
				const text = response.text ?? ""
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas2SL ok len=${text.length}`)
				if (text.trim().length > 0) {
					return text
				}
				const jsonValue: any = (response as any).json
				if (jsonValue != undefined) {
					slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas2SL json type=${typeof jsonValue}`)
					if (typeof jsonValue === "string") {
						return jsonValue
					}
					return JSON.stringify(jsonValue)
				}
				return ""
			}
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Canvas2SL status ${response.status}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, { url: apiUrl, headers: { "content-type": "text/plain", "accept": "text/plain, application/json" }, body })
		} catch (e) {
			const err: any = e
			const status = err?.status ?? err?.response?.status
			const respText = err?.response?.text ?? err?.text ?? ""
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, `Canvas2SL failed: status=${status} text=${respText}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, { url: apiUrl, headers: { "content-type": "text/plain", "accept": "text/plain, application/json" }, body })
		}
		return ""
	}

	async onunload() {
		if (this.selectionActionUpdateDebounce != undefined) {
			window.clearTimeout(this.selectionActionUpdateDebounce)
			this.selectionActionUpdateDebounce = undefined
		}
		if (this.selectionActionHideDebounce != undefined) {
			window.clearTimeout(this.selectionActionHideDebounce)
			this.selectionActionHideDebounce = undefined
		}
		this.selectionActionPopupEl?.remove()
		this.selectionActionPopupEl = undefined
		// commented out due to publishing process - see PlugInGuideline - could be deleted
		this.app.workspace.detachLeavesOfType(SemaLogicViewType);
		this.app.workspace.detachLeavesOfType(ASPViewType);
		this.detachKnowledgeCanvasLeaves();
		this.detachKnowledgeEditCanvasLeaves();
		this.detachInterpreterCanvasLeaves();
		await this.stopKnowledgeEdit();
		await this.stopSLInterpreter();
		//this.slComm.slaspview.unload()
		//this.app.workspace.detachLeavesOfType(SemaLogicViewType);
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, Default_profile, loadedData);
		if (loadedData?.showSelectionActionButtons == undefined) {
			this.settings.showSelectionActionButtons = Platform.isAndroidApp;
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.slComm.slview != undefined) { this.slComm.slview.setNewInitial(this.settings.mySLSettings[this.settings.mySetting].myOutputFormat, false) }
		this.updateOutstanding = true;
		//this.semaLogicParse();
	}

	handlePing() {
		semaLogicPing(this.settings, this.lastUpdate)
	}

	handleUpdate = (update: ViewUpdate) => {
		if (this.pauseAllRequests) {
			return;
		}
		if (this.statusSL) {
			if (update == null) { }
			else {
				if (update.view) {
					if (!update.docChanged && !update.focusChanged) {
						return;
					} else {
						if (this.parseDebounce != undefined) {
							window.clearTimeout(this.parseDebounce)
						}
						this.parseDebounce = window.setTimeout(() => {
							this.semaLogicUpdate()
						}, 400)
					}
				}
			}
		}

	}

	semaLogicUpdate(setView?: boolean) {

		this.waitingForResponse = true
		this.UpdateProcessing = true

		if (setView == true || setView == undefined) { this.setViews() }
		if (this.slComm?.slview == undefined) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, "Skip SemaLogicUpdate: slview not ready")
			this.waitingForResponse = false
			this.UpdateProcessing = false
			return
		}

		slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, 'Start SemaLogicUpdate')

		this.setViews()

		let activeView = this.getActiveView()
		this.semaLogicParse();

		if (!this.updating) {
			this.updating = true
			/* For Version 2.1.3 deactivated because of an editor problem by adding char for htmlupdating
						if (activeView != null) {
							const editortext = activeView.editor.getRange({ line: 0, ch: 0 }, { line: activeView.editor.lastLine(), ch: activeView.editor.lastLine.length })
							const addChar: string = " "
							let cursor = activeView.editor.getCursor()
							for (let i = 0; i < activeView.editor.lastLine(); i++) {
								if (activeView.editor.getLine(i).substring(0, semaLogicCommand.command_start.length) == semaLogicCommand.command_start) {
									if (activeView.editor.getLine(i).substring(activeView.editor.getLine(i).length - 1, activeView.editor.getLine(i).length) == semaLogicCommand.command_end) {
										// temporarly add a char for forcing an update of html-view 
										activeView.editor.setLine(i, activeView.editor.getLine(i).substring(0, activeView.editor.getLine(i).length) + addChar)
			
									} else {
										if (activeView.editor.getLine(i).substring(activeView.editor.getLine(i).length - 1, activeView.editor.getLine(i).length) == addChar) {
											// temporarly add a char for forcing an update of html-view 
											activeView.editor.setLine(i, activeView.editor.getLine(i).substring(0, activeView.editor.getLine(i).length - 1))
										}
									}
								}
							}
							// back to cursor
							activeView.editor.setCursor(cursor)
						}
			*/
			this.updating = false
		}

		this.UpdateProcessing = false
		this.waitingForResponse = false
	}


	getSemaLogicText(): string {
		if (this.slComm.slview.contentEl.textContent == null) {
			return ""
		} else {
			return this.slComm.slview.getContent()
		}
	}

	async semaLogicReset() {
		// let vAPI_URL_Reset = API_Defaults.Base_URL + ":" + API_Defaults.Port + API_Defaults.reset + "?sid=" + API_Defaults.SID;
		// let vAPI_URL_Reset = getHostPort(this.settings) + API_Defaults.reset + "?sid=" + this.settings.mySLSettings[this.settings.mySetting].mySID;
		let vAPI_URL_Reset = getHostPort(this.settings) + API_Defaults.reset + "?sid=" + mygSID;
		let optionsReset: RequestUrlParam
		if (this.settings.mySLSettings[this.settings.mySetting].myUseHttpsSL && this.settings.mySLSettings[this.settings.mySetting].myUserSL != '') {
			optionsReset = {
				url: vAPI_URL_Reset,
				method: 'POST',
				headers: {
					"content-type": "text/plain",
					"Authorization": "Basic " + btoa(this.settings.mySLSettings[this.settings.mySetting].myUserSL + ":" + this.settings.mySLSettings[this.settings.mySetting].myPasswordSL)
				},
			}
		} else {
			optionsReset = {
				url: vAPI_URL_Reset,
				method: 'POST',
				headers: {
					"content-type": "text/plain"
				},
			}
		}

		slconsolelog(DebugLevMap.DebugLevel_Important, this.slComm.slview, optionsReset)
		try {
			const responseReset = await requestUrl(optionsReset)
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, `SemaLogic: Reset with http-status ${responseReset.status.toString()}`)
		}
		catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, `Catcherror by reset ${vAPI_URL_Reset}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, e.toString())
		}
	}

}
