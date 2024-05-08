import { App, MarkdownView, Plugin, PluginSettingTab, requestUrl, Setting, WorkspaceLeaf, renderResults, RequestUrlParam, RequestUrlResponse, RequestUrlResponsePromise, ButtonComponent, MarkdownRenderChild, MarkdownPreviewView, View }
	from 'obsidian';
import { SemaLogicView, SemaLogicViewType } from "./src/view";
import { ASPView, ASPViewType } from "./src/view_asp";
import { ViewUpdate, EditorView } from "@codemirror/view";
import { SemaLogicRenderedElement, searchForSemaLogicCommands, getHostPort, semaLogicPing, slconsolelog } from "./src/utils";
import { API_Defaults, Value_Defaults, semaLogicCommand, RulesettypesCommands, Rstypes_Semalogic, Rstypes_Picture, Rstypes_ASP, DebugLevMap, DebugLevelNames, Rstypes_KnowledgeGraph, Rstypes_SemanticTree } from "./src/const"
import { ViewUtils } from 'src/view_utils';
//import { Rstypes_SemanticTree } from 'src/const only for UP';

export var DebugLevel = 0;

export var mygSID = String(Math.round(Math.random() * 99999999999))

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
						this.plugin.interval = window.setInterval(this.plugin.handleUpdate, this.plugin.settings.mySLSettings[this.plugin.settings.mySetting].myUpdateInterval)
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
	statusTransfer: boolean
	statusSL: boolean;

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

	// Due to change in Sprint 1/2023 to inline dialects, detection of contexts will be needed in later sprints 
	private getContextFromLine(mydialectID: string) {
		// ToDo: Replace von Tokons - bis die neue SemaLogicVersion bzgl. der Contexte verfügbar ist
		mydialectID = mydialectID.replace('SemaLogicContext≡', 'SemaLogicDialect≡');
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
		this.getActiveView()
		//this.semaLogicUpdate(false)
	}

	async onload(): Promise<void> {
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
		DebugLevel = this.settings.myDebugLevel

		// This adds a status bar for informations
		this.myStatus = this.addStatusBarItem()

		this.slComm = new SemaLogicPluginComm
		this.slComm.setSLClass(this)

		this.activateView();
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
		if (this.statusSL) {
			this.semaLogicReset();
			// Default is that SemaLogicView is activated but it can be deactivated by click on Ribbon Icon
			this.slComm.slview.setNewInitial(this.settings.mySLSettings[this.settings.mySetting].myOutputFormat);
			this.semaLogicParse();
		}
		this.registerInterval(
			this.interval = window.setInterval(this.handleUpdate, this.settings.mySLSettings[this.settings.mySetting].myUpdateInterval)
		);
		this.registerEditorExtension([EditorView.updateListener.of(this.handleUpdate)]);
	}

	async semaLogicParse(): Promise<Node[]> {

		this.setViews();

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


		bodytext = this.view_utils.cleanCommands(bodytext)
		if (dialectID == "") { dialectID = "default" }

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

		return results
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
		this.semaLogicUpdate()
		this.myStatus.setText('SemaLogic is on');
	}

	async deactivateASPView() {
		this.app.workspace.detachLeavesOfType(ASPViewType);
		this.slComm.activatedASP = false
		this.statusTransfer = true
		this.myStatus.setText('ASP is off');
	}

	async deactivateView() {
		this.app.workspace.detachLeavesOfType(SemaLogicViewType);
		this.activated = false
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
		if (!found) {
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
		if (!found) {
			slconsolelog(DebugLevMap.DebugLevel_All, undefined, 'Split')
			slv = this.app.workspace.getLeaf('split');
			slconsolelog(DebugLevMap.DebugLevel_All, undefined, slv)
		}
		return slv
	}


	async onunload() {
		// commented out due to publishing process - see PlugInGuideline - could be deleted
		this.app.workspace.detachLeavesOfType(ASPViewType);
		//this.slComm.slaspview.unload()
		//this.app.workspace.detachLeavesOfType(SemaLogicViewType);
	}

	async loadSettings() {
		this.settings = Object.assign({}, Default_profile, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.slComm.slview != undefined) { this.slComm.slview.setNewInitial(this.settings.mySLSettings[this.settings.mySetting].myOutputFormat) }
		this.updateOutstanding = true;
		//this.semaLogicParse();
	}

	handlePing() {
		semaLogicPing(this.settings, this.lastUpdate)
	}

	handleUpdate = (update: ViewUpdate) => {
		if (this.statusSL) {
			// To avoid to much parsing traffic for testing we tried to parse it only every 500 ms when there is an update
			const text = 'Updatetime' + '/' + String(Date.now()) + '/' + String(this.lastUpdate) + '/' + String(Date.now() - this.lastUpdate) + '/' + String(this.updateOutstanding) + '/' + String(this.waitingForResponse)
			slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, text)
			if (update == null) { }
			else {
				if (update.view) {
					if (!update.docChanged && !update.focusChanged) {
						return;
					} else {
						if (this.UpdateProcessing == false) {
							//this.updateOutstanding = true
							slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Start Update docChanged, focuschanged, UpdProc  ' + String(update.docChanged) + "/" + String(update.focusChanged) + "/" + String(this.UpdateProcessing))
							this.semaLogicUpdate()
						}
					}
				}
			}

			if ((Date.now() - this.lastUpdate > this.settings.mySLSettings[this.settings.mySetting].myUpdateInterval) && (this.updateOutstanding == true || this.updateTransferOutstanding == true) && (this.waitingForResponse == false)) {
				slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Start Update PARSING')
				this.lastUpdate = Date.now()
				this.semaLogicUpdate()
				//this.updateTransferOutstanding = false
				//slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Set in interval UpdateASPOutstanding:' + this.updateTransferOutstanding)
			} else
				if ((Date.now() - this.lastUpdate > this.settings.mySLSettings[this.settings.mySetting].myUpdateInterval) && (this.updateOutstanding == true) && (this.waitingForResponse == false)) {
					semaLogicPing(this.settings, this.lastUpdate)
				}
		}

	}

	semaLogicUpdate(setView?: boolean) {

		this.waitingForResponse = true
		this.UpdateProcessing = true

		if (setView == true || setView == undefined) { this.setViews() }

		slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, 'Start SemaLogicUpdate')

		this.setViews()
		let activeView = this.getActiveView()
		this.semaLogicParse();

		if (!this.updating) {
			this.updating = true
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

