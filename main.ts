import { App, MarkdownView, Plugin, PluginSettingTab, requestUrl, Setting, WorkspaceLeaf, renderResults, RequestUrlParam, RequestUrlResponse, RequestUrlResponsePromise, ButtonComponent, MarkdownRenderChild, MarkdownPreviewView, View, TFile, normalizePath, MarkdownRenderer, setIcon, Platform, Notice, Modal, TextComponent }
	from 'obsidian';
import { SemaLogicView, SemaLogicViewType } from "./src/view";
import { ASPView, ASPViewType } from "./src/view_asp";
import { ViewUpdate, EditorView } from "@codemirror/view";
import { SemaLogicRenderedElement, searchForSemaLogicCommands, getHostPort, semaLogicPing, slconsolelog } from "./src/utils";
import { API_Defaults, Value_Defaults, semaLogicCommand, RulesettypesCommands, Rstypes_Semalogic, Rstypes_Picture, Rstypes_ASP, DebugLevMap, DebugLevelNames, Rstypes_KnowledgeGraph, Rstypes_SemanticTree, DialectV1_Label, DialectV2_Label, EngineDialectV1, EngineDialectV2, RulesettypeDialectEngine, DialectGen_Label } from "./src/const"
import { buildSLInterpreterAnchor, extractSLInterpreterAnchorData } from "./src/sl_interpreter_helpers";
import { ViewUtils } from 'src/view_utils';
import { createTemplateFolder } from 'src/template';
import { createExamples } from 'src/examples';
import { createTestCanvas, createTemplateCanvas } from 'src/test_canvas';
import { slTermHider } from "src/sl_term_hider";
import { LawCatalogView, LawCatalogViewType, LawDocumentIdentity } from "src/view_law_catalog";
import { LawRawMarkdownView, LawRawViewType } from "src/view_law_raw";
import { LawPickerModal } from "src/law_picker";
import { LawNoteMeta, buildLawNote, lawNotePath, lawNoteRevalidationEtag, readLawNoteMeta } from "src/law_note";
import { deannotateLawHtml } from "src/law_transfer";
import {
	LawCitationSelector, LawLinkRoute, backlinkEntryMarkup, decorateBacklinkEntries,
	findBacklinkSource, resolveBacklinkRoute, routeFromLawHref
} from "src/law_backlinks";
import { LawLoadProgress } from "src/law_progress";
import { LawStreamResponse, fetchLawDocumentStreaming, lawHeaderValue, resetLawStreaming } from "src/law_fetch";
import {
	LawIndexEntry, LawIndexRoute, LawIndexStore, LawIndexUnavailableError,
	formatLawByteSize, lawDocumentRoute, lawIdForAddress, makeLawIndexEntry,
	readLawDocumentTitles, rememberLawRecent, utf8ByteLength
} from "src/law_index";

// What one statute fetch produced. `unchanged` marks a 304 against the note
// that is already in the vault: nothing was transferred and nothing is written.
type LawMarkdownResult = {
	markdown: string
	source: "raw.md" | "deannotate"
	etag: string
	version: string
	lawId: string
	unchanged: boolean
}
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

class CanvasAttributeValueModal extends Modal {
	private readonly initialValue: string
	private readonly resolveValue: (value: string | undefined) => void
	private valueComponent: TextComponent | undefined

	constructor(app: App, initialValue: string, resolveValue: (value: string | undefined) => void) {
		super(app)
		this.initialValue = initialValue
		this.resolveValue = resolveValue
	}

	onOpen(): void {
		const { contentEl, titleEl } = this
		titleEl.setText("Configure ATTRIBUTE node")
		contentEl.empty()

		const setting = new Setting(contentEl)
			.setName("Value")
			.setDesc("Enter the value for the ATTRIBUTE node.")
			.addText((text) => {
				this.valueComponent = text
				text.setValue(this.initialValue)
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
		this.resolveValue(this.valueComponent?.getValue() ?? "")
		this.close()
	}
}

// Section-class annotations (e.g. law/division/.../number) come from external HTML
// embedded into notes and are rendered directly in the reading view. The plugin can
// style them: a fixed level-based default (toggleable) plus per-class overrides that
// are stored in named "style slots" (at least 3) inside data.json.
export const SL_SECTION_CLASSES = ["law", "division", "subdivision", "paragraph", "subsection", "number", "letter", "enumeration", "sentence", "preamble", "footnote"] as const;
export type SLSectionClass = typeof SL_SECTION_CLASSES[number];

// Inline SemaLogic annotations that share the same styleable properties as the
// section classes: the SL-Interpreter anchor (a[data-sl-interpreter="1"], carrying
// data-sl-text) and the SL-reference span (span[data-sl-ref]). Baseline defaults
// mirror styles.css so the look is preserved when a slot keeps its defaults.
export const SL_ANNOTATION_KEYS = ["interpreter", "ref"] as const;
export type SLAnnotationKey = typeof SL_ANNOTATION_KEYS[number];

export const SL_TEXT_DECORATION_LINES = ["", "none", "underline", "overline", "line-through"] as const;
export const SL_TEXT_DECORATION_STYLES = ["", "solid", "dashed", "dotted", "double", "wavy"] as const;

export interface SLSectionStyle {
	color: string;                // CSS color, empty = inherit/not set
	fontFamily: string;           // CSS font-family, empty = inherit/not set
	fontSize: string;             // CSS font-size, empty = inherit/not set
	lineHeight: string;           // CSS line-height, empty = inherit/not set
	fontWeight: string;           // CSS font-weight, empty = inherit/not set
	textDecorationColor: string;  // CSS color, empty = not set
	textDecorationLine: string;   // none | underline | overline | line-through | ""
	textDecorationStyle: string;  // solid | dashed | dotted | double | wavy | ""
	indent: string;               // CSS length applied as margin-left, empty = not set
	marginTop: string;            // CSS margin-top, empty = not set
	marginBottom: string;         // CSS margin-bottom, empty = not set
	paddingTop: string;           // CSS padding-top, empty = not set
	paddingBottom: string;        // CSS padding-bottom, empty = not set
	borderTop: string;            // CSS border-top, empty = not set
	headingColor: string;         // CSS color for headings directly inside this class
	headingFontSize: string;      // CSS font-size for headings directly inside this class
	headingFontWeight: string;    // CSS font-weight for headings directly inside this class
	headingMarginBottom: string;  // CSS margin-bottom for headings directly inside this class
	headingPaddingBottom: string; // CSS padding-bottom for headings directly inside this class
	headingBorderBottom: string;  // CSS border-bottom for headings directly inside this class
}

// A section-class style carries its own class name, so each style-set can define
// its own list of section classes (add/remove/rename), not just the built-in six.
export interface SLSectionClassStyle extends SLSectionStyle {
	className: string;
}

export const SL_DEFAULT_LEVEL_INDENT = "0";

export interface SLSectionStyleSlot {
	name: string;
	levelIndent: string;  // base left indent added per nesting level (data-sl-level)
	classStyles: SLSectionClassStyle[];   // per-set, user-editable list of section classes
	annotations: Record<SLAnnotationKey, SLSectionStyle>;
	target: SLTargetStyle;
}

// A followed internal citation is addressed by the global :target pseudo-class,
// so its look belongs to the style-set rather than to an individual class.
export interface SLTargetStyle {
	background: string;
	borderRadius: string;
	boxShadow: string;
	scrollMarginTop: string;
}

export function defaultTargetStyle(): SLTargetStyle {
	return {
		background: "var(--sl-law-target)",
		borderRadius: "2px",
		boxShadow: "0 0 0 0.25rem var(--sl-law-target)",
		scrollMarginTop: "2rem"
	};
}

export function emptySectionStyle(): SLSectionStyle {
	return {
		color: "", fontFamily: "", fontSize: "", lineHeight: "", fontWeight: "",
		textDecorationColor: "", textDecorationLine: "", textDecorationStyle: "", indent: "",
		marginTop: "", marginBottom: "", paddingTop: "", paddingBottom: "", borderTop: "",
		headingColor: "", headingFontSize: "", headingFontWeight: "", headingMarginBottom: "",
		headingPaddingBottom: "", headingBorderBottom: ""
	};
}

export function makeSectionClassStyle(className: string): SLSectionClassStyle {
	return Object.assign({ className }, emptySectionStyle());
}

export function defaultSectionClassStyles(): SLSectionClassStyle[] {
	return SL_SECTION_CLASSES.map((cls) => {
		const s = makeSectionClassStyle(cls);
		// law.css-inspired defaults. Every value remains editable on the class,
		// allowing one rule to style all occurrences of that structural class.
		if (cls == "law") {
			s.fontFamily = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
			s.fontSize = "1.0625rem";
			s.lineHeight = "1.62";
		}
		if (cls == "paragraph") {
			s.marginTop = "2rem";
			s.marginBottom = "2rem";
			s.paddingTop = "1.1rem";
			s.borderTop = "1px solid var(--background-modifier-border)";
			s.headingColor = "#24548f";
			s.headingFontSize = "1.05rem";
			s.headingFontWeight = "700";
			s.headingMarginBottom = "0.6rem";
		}
		if (cls == "subsection") { s.marginTop = "1rem"; s.marginBottom = "1rem"; }
		if (cls == "number" || cls == "letter") { s.indent = "1.1em"; s.marginTop = "0.35rem"; }
		if (cls == "enumeration") { s.marginTop = "0.45rem"; s.marginBottom = "0.55rem"; }
		if (cls == "preamble") { s.marginTop = "1rem"; s.marginBottom = "2.5rem"; s.indent = "0.9rem"; }
		if (cls == "footnote") { s.fontSize = "0.82em"; }
		return s;
	});
}

export function defaultAnnotationStyles(): Record<SLAnnotationKey, SLSectionStyle> {
	return {
		interpreter: Object.assign(emptySectionStyle(), { color: "white", textDecorationColor: "grey", textDecorationLine: "underline", textDecorationStyle: "dashed" }),
		ref: Object.assign(emptySectionStyle(), { color: "white", textDecorationColor: "teal", textDecorationLine: "underline", textDecorationStyle: "solid" }),
	};
}

export function defaultSectionStyleSlot(name: string): SLSectionStyleSlot {
	return { name, levelIndent: SL_DEFAULT_LEVEL_INDENT, classStyles: defaultSectionClassStyles(), annotations: defaultAnnotationStyles(), target: defaultTargetStyle() };
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
	showDiagnosticDefects: boolean;         // defect findings visible in the SemaLogic view
	showDiagnosticWarnings: boolean;        // suspect findings visible in the SemaLogic view
	showDiagnosticDeveloper: boolean;       // request findings with audience=developer
	showResultAsSource: boolean;            // show the response payload as source text instead of rendered
	sectionStyleEnabled: boolean;           // master on/off for the section-class styling
	sectionStyleSlot: number;               // index of the active style slot
	sectionStyleSlots: SLSectionStyleSlot[]; // named, independently switchable style slots
	lawRecents: string[];                   // lawIds last opened from the statute picker, most recent first
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
	showDiagnosticDefects: true,
	showDiagnosticWarnings: true,
	// Off by default: audience=user is the server default and keeps engine
	// internals out of the reply until they are asked for.
	showDiagnosticDeveloper: false,
	// Off by default: the rendered result is what the view is for, the source
	// text is the on-demand look behind it.
	showResultAsSource: false,
	sectionStyleEnabled: true,
	sectionStyleSlot: 0,
	sectionStyleSlots: [
		defaultSectionStyleSlot("Style-Set 1"),
		defaultSectionStyleSlot("Style-Set 2"),
		defaultSectionStyleSlot("Style-Set 3"),
	],
	// WP23a T2: the statute picker's empty-query list. A reader works with the
	// same handful of statutes for weeks, so this is persisted with the settings.
	lawRecents: [],
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

	// Remembers which collapsible groups the user has expanded, so a re-render
	// (this.display() is called from many onChange handlers) keeps their state.
	private groupOpen: Record<string, boolean> = {};

	// Which section class (index into the active style-set's list) is currently
	// selected for editing in the Section-Style group.
	private selectedSectionIndex: number = 0;

	// Create a collapsible <details> group and persist its open/closed state.
	private makeCollapsible(containerEl: HTMLElement, key: string, title: string, defaultOpen: boolean, cls: string): HTMLElement {
		const details = containerEl.createEl('details', { cls });
		details.open = this.groupOpen[key] ?? defaultOpen;
		this.groupOpen[key] = details.open;
		details.createEl('summary', { cls: `${cls}-summary`, text: title });
		details.addEventListener('toggle', () => { this.groupOpen[key] = details.open; });
		return details;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Headline for SettingsTab
		containerEl.createEl('h2', { text: 'Settings for SemaLogic:' });

		// Group 1: profile settings (general SemaLogic + Transfer/ASP), expanded by default
		const profileGroup = this.makeCollapsible(containerEl, 'profile', 'Profile settings', true, 'sl-settings-group');
		this.renderProfileSettings(profileGroup);

		// Group 2: SemaLogic snippet styles, collapsed by default
		const snippetGroup = this.makeCollapsible(containerEl, 'snippet', 'SemaLogic Snippet-Styles', false, 'sl-settings-group');
		this.renderSnippetStyleSettings(snippetGroup);
	}

	private renderProfileSettings(containerEl: HTMLElement): void {
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

		// Startup state of the Defects / Warnings buttons in the SemaLogic view.
		// The buttons write back here, so the last choice is what comes up again.
		new Setting(containerEl)
			.setName('Show defects')
			.setDesc('Display defect findings in the SemaLogic view (toggled by the Defects button)')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.showDiagnosticDefects)
				.onChange(async (value) => {
					this.plugin.settings.showDiagnosticDefects = value;
					// Switching on expands the section, as the view buttons do.
					if (value) { this.plugin.slComm?.slview?.expandDiagnosticSection('defect') }
					await this.plugin.saveSettings()
					this.plugin.slComm?.slview?.refreshDiagnostics()
				}));

		new Setting(containerEl)
			.setName('Show warnings')
			.setDesc('Display suspect findings in the SemaLogic view (toggled by the Warnings button)')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.showDiagnosticWarnings)
				.onChange(async (value) => {
					this.plugin.settings.showDiagnosticWarnings = value;
					if (value) { this.plugin.slComm?.slview?.expandDiagnosticSection('suspect') }
					await this.plugin.saveSettings()
					this.plugin.slComm?.slview?.refreshDiagnostics()
				}));

		new Setting(containerEl)
			.setName('Show developer findings')
			.setDesc('Request findings with audience=developer, including engine internals and their origin (toggled by the Developer button)')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.showDiagnosticDeveloper)
				.onChange(async (value) => {
					this.plugin.settings.showDiagnosticDeveloper = value;
					await this.plugin.saveSettings()
					await this.plugin.slComm?.slview?.reloadDiagnosticsForAudience(value)
				}));

		// Startup state of the Rendered / Source button in the SemaLogic view.
		new Setting(containerEl)
			.setName('Show result as source')
			.setDesc('Display the response payload as unrendered source text instead of rendered output (toggled by the Rendered/Source button)')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.showResultAsSource)
				.onChange(async (value) => {
					this.plugin.settings.showResultAsSource = value;
					await this.plugin.saveSettings()
					this.plugin.slComm?.slview?.updateView()
				}));

		// Transfer / ASP view is part of the profile settings, but collapsed by default
		const transferGroup = this.makeCollapsible(containerEl, 'transfer', 'Transfer / ASP view', false, 'sl-settings-subgroup');
		this.renderTransferSettings(transferGroup);
	}

	// Settings of the Transfer/ASP service (nested inside the profile settings).
	private renderTransferSettings(containerEl: HTMLElement): void {
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

	// Styling for the embedded HTML snippets: the SL-Interpreter annotations
	// (data-sl-text / data-sl-ref) and the section classes (law, division, ...).
	private renderSnippetStyleSettings(containerEl: HTMLElement): void {
		this.plugin.ensureSectionStyleSettings();

		// Master on/off for the whole snippet styling
		new Setting(containerEl)
			.setName('Enable snippet styles')
			.setDesc('Apply default styles (based on data-sl-level) plus the interpreter/reference and per-class overrides below. When off, the built-in defaults from styles.css apply.')
			.addToggle(setting => setting
				.setValue(this.plugin.settings.sectionStyleEnabled)
				.onChange(async (value) => {
					this.plugin.settings.sectionStyleEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.applySectionStyles();
					this.display();
				}));

		if (!this.plugin.settings.sectionStyleEnabled) { return }

		const slots = this.plugin.settings.sectionStyleSlots;

		// Choose which of the (>=3) style slots is active
		new Setting(containerEl)
			.setName('Active style-set')
			.setDesc('Switch between independently stored style-sets. All edits below are saved into the selected style-set.')
			.addDropdown(dropDown => {
				slots.forEach((slot, i) => dropDown.addOption(String(i), slot.name || `Style-Set ${i + 1}`));
				dropDown
					.setValue(String(this.plugin.settings.sectionStyleSlot))
					.onChange(async (value) => {
						this.plugin.settings.sectionStyleSlot = parseInt(value);
						await this.plugin.saveSettings();
						this.plugin.applySectionStyles();
						this.display();
					});
			});

		const activeSlot = slots[this.plugin.settings.sectionStyleSlot];

		// Rename the active slot
		new Setting(containerEl)
			.setName('Style-set name')
			.setDesc('A label for the selected style-set.')
			.addText(text => text
				.setValue(activeSlot.name)
				.onChange(async (value) => {
					activeSlot.name = value;
					await this.plugin.saveSettings();
					// no full redisplay while typing; dropdown label refreshes on next open
				}));

		// Reset the active slot to defaults
		new Setting(containerEl)
			.setName('Reset this style-set')
			.setDesc('Restore the selected style-set to its default values.')
			.addButton(button => button
				.setButtonText('Reset')
				.setWarning()
				.onClick(async () => {
					const reset = defaultSectionStyleSlot(activeSlot.name);
					slots[this.plugin.settings.sectionStyleSlot] = reset;
					await this.plugin.saveSettings();
					this.plugin.applySectionStyles();
					this.display();
				}));

		// Base indent applied per nesting level (data-sl-level) — a snippet-style base value
		new Setting(containerEl)
			.setName('Base indent per level')
			.setDesc('Left indent added at each nesting level (data-sl-level), e.g. 0.8em. Level 1 stays flush. Saved in the selected style-set.')
			.addText(text => text
				.setPlaceholder(SL_DEFAULT_LEVEL_INDENT)
				.setValue(activeSlot.levelIndent)
				.onChange(async (value) => {
					activeSlot.levelIndent = value;
					await this.plugin.saveSettings();
					this.plugin.applySectionStyles();
				}));

		const targetGroup = this.makeCollapsible(containerEl, 'snip-target', 'Followed citation target (:target)', false, 'sl-settings-subgroup');
		this.renderTargetStyleControls(targetGroup, activeSlot.target);

		// SL-Interpreter for data-sl-text (the interpreter anchor)
		const interpGroup = this.makeCollapsible(containerEl, 'snip-interp', 'SL-Interpreter für data-sl-text', false, 'sl-settings-subgroup');
		this.renderStyleControls(interpGroup, activeSlot.annotations.interpreter, false);

		// SL-Interpreter for data-sl-ref (the reference span)
		const refGroup = this.makeCollapsible(containerEl, 'snip-ref', 'SL-Interpreter für data-sl-ref', false, 'sl-settings-subgroup');
		this.renderStyleControls(refGroup, activeSlot.annotations.ref, false);

		// Section styles per class: the class list is editable per style-set (add /
		// remove / rename). Pick a class from the dropdown, then edit only its props.
		const sectionGroup = this.makeCollapsible(containerEl, 'snip-section', 'Section-Style', false, 'sl-settings-subgroup');
		const classStyles = activeSlot.classStyles;
		if (this.selectedSectionIndex >= classStyles.length) { this.selectedSectionIndex = Math.max(0, classStyles.length - 1); }

		if (classStyles.length > 0) {
			new Setting(sectionGroup)
				.setName('Section class')
				.setDesc('Choose which section class to style. The list is stored per style-set.')
				.addDropdown(dropDown => {
					classStyles.forEach((cs, i) => dropDown.addOption(String(i), cs.className || `(class ${i + 1})`));
					dropDown
						.setValue(String(this.selectedSectionIndex))
						.onChange((value) => {
							this.selectedSectionIndex = parseInt(value);
							this.display();
						});
				});

			const selected = classStyles[this.selectedSectionIndex];

			// Rename the selected class
			new Setting(sectionGroup)
				.setName('Class name')
				.setDesc('The section class this style targets (matches class="…" in the HTML).')
				.addText(text => text
					.setValue(selected.className)
					.onChange(async (value) => {
						selected.className = value;
						await this.plugin.saveSettings();
						this.plugin.applySectionStyles();
						// dropdown label refreshes on next open
					}));

			this.renderStyleControls(sectionGroup, selected, true);

			// Remove the selected class from this style-set
			new Setting(sectionGroup)
				.setName('Remove this class')
				.setDesc('Delete the selected section class from this style-set.')
				.addButton(button => button
					.setButtonText('Remove')
					.setWarning()
					.onClick(async () => {
						classStyles.splice(this.selectedSectionIndex, 1);
						this.selectedSectionIndex = Math.max(0, this.selectedSectionIndex - 1);
						await this.plugin.saveSettings();
						this.plugin.applySectionStyles();
						this.display();
					}));
		} else {
			sectionGroup.createEl('p', { text: 'No section classes defined in this style-set yet.' });
		}

		// Add a new section class to this style-set
		let newClassName = '';
		new Setting(sectionGroup)
			.setName('Add section class')
			.setDesc('Add a class name (e.g. law, division, or a custom one) to this style-set.')
			.addText(text => text
				.setPlaceholder('class name')
				.onChange((value) => { newClassName = value; }))
			.addButton(button => button
				.setButtonText('Add')
				.setCta()
				.onClick(async () => {
					const name = newClassName.trim();
					if (name.length == 0) { new Notice('Please enter a class name.'); return; }
					classStyles.push(makeSectionClassStyle(name));
					this.selectedSectionIndex = classStyles.length - 1;
					await this.plugin.saveSettings();
					this.plugin.applySectionStyles();
					this.display();
				}));

		// Reset the class list of this style-set to the built-in defaults
		new Setting(sectionGroup)
			.setName('Reset class list')
			.setDesc('Restore the default section classes (law, division, subdivision, paragraph, subsection, number) for this style-set.')
			.addButton(button => button
				.setButtonText('Reset classes')
				.setWarning()
				.onClick(async () => {
					activeSlot.classStyles = defaultSectionClassStyles();
					this.selectedSectionIndex = 0;
					await this.plugin.saveSettings();
					this.plugin.applySectionStyles();
					this.display();
				}));
	}

	// A color row: free-text field (allows empty = default, and named colors),
	// a native color picker as a click helper, and a button to clear the value.
	private renderColorSetting(containerEl: HTMLElement, name: string, desc: string, getValue: () => string, setValue: (v: string) => void): void {
		let textComp: TextComponent | undefined;
		const apply = async (value: string) => {
			setValue(value);
			await this.plugin.saveSettings();
			this.plugin.applySectionStyles();
		};
		const setting = new Setting(containerEl).setName(name).setDesc(desc);
		setting.addText(text => {
			textComp = text;
			text.setPlaceholder('(default)')
				.setValue(getValue())
				.onChange(async (value) => { await apply(value); });
		});
		setting.addColorPicker(cp => {
			const cur = getValue();
			if (/^#[0-9a-fA-F]{6}$/.test(cur)) { cp.setValue(cur); }
			cp.onChange(async (value) => {
				await apply(value);
				textComp?.setValue(value);
			});
		});
		setting.addExtraButton(btn => btn
			.setIcon('cross')
			.setTooltip('Clear (use default)')
			.onClick(async () => {
				await apply('');
				textComp?.setValue('');
			}));
	}

	private renderCssTextSetting(containerEl: HTMLElement, name: string, desc: string, getValue: () => string, setValue: (v: string) => void): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText(text => text
				.setPlaceholder('(default)')
				.setValue(getValue())
				.onChange(async (value) => {
					setValue(value);
					await this.plugin.saveSettings();
					this.plugin.applySectionStyles();
				}));
	}

	private renderTargetStyleControls(containerEl: HTMLElement, style: SLTargetStyle): void {
		this.renderCssTextSetting(containerEl, 'background', 'Highlight background for the element selected by an internal link.',
			() => style.background, (v) => { style.background = v; });
		this.renderCssTextSetting(containerEl, 'border-radius', 'Corner radius of the target highlight, e.g. 2px.',
			() => style.borderRadius, (v) => { style.borderRadius = v; });
		this.renderCssTextSetting(containerEl, 'box-shadow', 'Outer highlight, e.g. 0 0 0 0.25rem var(--sl-law-target).',
			() => style.boxShadow, (v) => { style.boxShadow = v; });
		this.renderCssTextSetting(containerEl, 'scroll-margin-top', 'Top offset when navigating to the target, e.g. 2rem.',
			() => style.scrollMarginTop, (v) => { style.scrollMarginTop = v; });
	}

	private renderStyleControls(containerEl: HTMLElement, style: SLSectionStyle, includeIndent: boolean): void {
		this.renderColorSetting(containerEl, 'color', 'Text color, e.g. #b97900 or teal. Leave empty for the default.',
			() => style.color, (v) => { style.color = v; });
		this.renderCssTextSetting(containerEl, 'font-family', 'Font stack for this class, e.g. Georgia, serif. Leave empty to inherit.',
			() => style.fontFamily, (v) => { style.fontFamily = v; });
		this.renderCssTextSetting(containerEl, 'font-size', 'Text size for this class, e.g. 1.0625rem. Leave empty to inherit.',
			() => style.fontSize, (v) => { style.fontSize = v; });
		this.renderCssTextSetting(containerEl, 'line-height', 'Line height for this class, e.g. 1.62. Leave empty to inherit.',
			() => style.lineHeight, (v) => { style.lineHeight = v; });
		this.renderCssTextSetting(containerEl, 'font-weight', 'Text weight for this class, e.g. 400 or 700. Leave empty to inherit.',
			() => style.fontWeight, (v) => { style.fontWeight = v; });

		this.renderColorSetting(containerEl, 'text-decoration-color', 'Color of the underline/decoration line. Leave empty for the default.',
			() => style.textDecorationColor, (v) => { style.textDecorationColor = v; });

		new Setting(containerEl)
			.setName('text-decoration-line')
			.addDropdown(dropDown => {
				SL_TEXT_DECORATION_LINES.forEach(opt => dropDown.addOption(opt, opt.length == 0 ? '(default)' : opt));
				dropDown
					.setValue(style.textDecorationLine)
					.onChange(async (value) => {
						style.textDecorationLine = value;
						await this.plugin.saveSettings();
						this.plugin.applySectionStyles();
					});
			});

		new Setting(containerEl)
			.setName('text-decoration-style')
			.addDropdown(dropDown => {
				SL_TEXT_DECORATION_STYLES.forEach(opt => dropDown.addOption(opt, opt.length == 0 ? '(default)' : opt));
				dropDown
					.setValue(style.textDecorationStyle)
					.onChange(async (value) => {
						style.textDecorationStyle = value;
						await this.plugin.saveSettings();
						this.plugin.applySectionStyles();
					});
			});

		if (includeIndent) {
			this.renderCssTextSetting(containerEl, 'indent (margin-left)', 'Extra left indent, e.g. 1.1em or 20px. Leave empty for the default.',
				() => style.indent, (v) => { style.indent = v; });
			this.renderCssTextSetting(containerEl, 'margin-top', 'Space before every element of this class.',
				() => style.marginTop, (v) => { style.marginTop = v; });
			this.renderCssTextSetting(containerEl, 'margin-bottom', 'Space after every element of this class.',
				() => style.marginBottom, (v) => { style.marginBottom = v; });
			this.renderCssTextSetting(containerEl, 'padding-top', 'Inner space above every element of this class.',
				() => style.paddingTop, (v) => { style.paddingTop = v; });
			this.renderCssTextSetting(containerEl, 'padding-bottom', 'Inner space below every element of this class.',
				() => style.paddingBottom, (v) => { style.paddingBottom = v; });
			this.renderCssTextSetting(containerEl, 'border-top', 'Top rule for this class, e.g. 1px solid var(--background-modifier-border).',
				() => style.borderTop, (v) => { style.borderTop = v; });

			const headingGroup = this.makeCollapsible(containerEl, 'snip-heading', 'Heading inside this class', false, 'sl-settings-subgroup');
			this.renderColorSetting(headingGroup, 'color', 'Color of a heading directly inside this class.',
				() => style.headingColor, (v) => { style.headingColor = v; });
			this.renderCssTextSetting(headingGroup, 'font-size', 'Heading size, e.g. 1.05rem.',
				() => style.headingFontSize, (v) => { style.headingFontSize = v; });
			this.renderCssTextSetting(headingGroup, 'font-weight', 'Heading weight, e.g. 700.',
				() => style.headingFontWeight, (v) => { style.headingFontWeight = v; });
			this.renderCssTextSetting(headingGroup, 'margin-bottom', 'Space following a heading in this class.',
				() => style.headingMarginBottom, (v) => { style.headingMarginBottom = v; });
			this.renderCssTextSetting(headingGroup, 'padding-bottom', 'Inner space beneath a heading in this class.',
				() => style.headingPaddingBottom, (v) => { style.headingPaddingBottom = v; });
			this.renderCssTextSetting(headingGroup, 'border-bottom', 'Rule beneath a heading in this class.',
				() => style.headingBorderBottom, (v) => { style.headingBorderBottom = v; });
		}
	}
}

// CommunicationClass for interaction between SLview and editor window
export class SemaLogicPluginComm {
	slview!: SemaLogicView
	slPlugin!: SemaLogicPlugin
	slaspview!: ASPView
	activatedASP: boolean = false;
	activatedKnowledge: boolean = false;
	slUsedMDView!: MarkdownView

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
	settings!: SemaLogicPluginSettings;
	semaLogicView!: SemaLogicView;
	myStatus!: HTMLElement;
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
	slComm!: SemaLogicPluginComm;
	lastactiveView!: MarkdownView;
	view_utils = new ViewUtils
	interval!: number
	parseDebounce: number | undefined
	lastParsedHash: string = ""
	private parseInFlightHash: string | undefined
	private automaticParseRetry: number | undefined
	private automaticParseRetryCount: number = 0
	private startupInitialization: Promise<void> | undefined
	canvasTooltipEl: HTMLElement | undefined
	canvasTooltipCleanup: (() => void) | undefined
	canvasTooltipObservers: WeakMap<WorkspaceLeaf, MutationObserver> = new WeakMap()
	interpreterModalEl: HTMLElement | undefined
	interpreterModalCleanup: (() => void) | undefined
	interpreterBusy: boolean = false
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
	interpreterSelection: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number }; sourceText: string; original: string; persist: boolean } | undefined
	interpreterDebounce: number | undefined
	pauseAllRequests: boolean = false
	sectionStyleEl: HTMLStyleElement | undefined
	private semaLogicViewRegistered: boolean = false
	private lawCatalogViewRegistered: boolean = false
	private lawRawViewRegistered: boolean = false
	// WP23a T1: the session copy of /law/index. The fetched statutes themselves
	// are not cached here - the note in the vault carries its own ETag, so
	// re-opening one revalidates against the file the reader can see.
	private lawIndexStore: LawIndexStore | undefined
	// Set once /law/index answered 404: this server predates WP23a S1.
	private lawIndexUnavailable: boolean = false
	// Set once the raw-source route answered something other than 404: this
	// server does not implement WP23's download at all.
	private lawRawDownloadUnavailable: boolean = false
	private lawLoadProgress: LawLoadProgress = new LawLoadProgress()
	private lawLoadInFlight: string | undefined

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
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
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
			// instanceof, not getViewType(): a deferred leaf reports the type
			// without carrying the view, and adopting the placeholder as
			// slComm.slview would break every later call on it.
			switch (leaf.view instanceof SemaLogicView || leaf.view instanceof ASPView
				? leaf.view.getViewType()
				: "") {
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
			menu.addItem((item) => {
				item.setTitle(DialectV1_Label)
					.onClick(() => {
						this.runDialectInView(view as MarkdownView, selection, EngineDialectV1);
					});
			});
			menu.addItem((item) => {
				item.setTitle(DialectV2_Label)
					.onClick(() => {
						this.runDialectInView(view as MarkdownView, selection, EngineDialectV2);
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
			const slText = link.getAttribute("data-sl-text")?.trim() || link.getAttribute("title")?.trim() || link.getAttribute("data-sl-ref")?.trim() || ""
			const trackSelection = (view && slText.length > 0) ? this.findSLInterpreterSelectionForAnchor(view, selection, slText) : undefined
			if (slText.length > 0) {
				this.startSLInterpreterFromSLText(selection, slText, trackSelection)
				return
			}
			this.startSLInterpreterFromText(selection)
		});
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement | null
			const link = target?.closest("a[data-sl-link-kind='external-law']") as HTMLAnchorElement | null
			if (link == undefined) { return }
			evt.preventDefault()
			evt.stopPropagation()
			void this.openExternalLawLink(link)
		}, true)
		// The reference list of an AnnotatedHTML-with-backlinks document. Its
		// entries sit outside .lawlink and outside the annotated citation markup,
		// so none of the three routes above ever saw them and the list named a
		// reference without leading to it (issues-private/02).
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement | null
			if (target == undefined) { return }
			const source = findBacklinkSource(target)
			if (source == undefined) { return }
			evt.preventDefault()
			evt.stopPropagation()
			void this.openBacklinkTarget(source)
		}, true)
		// A resolved citation in the running text. The service writes it as a bare
		// <a href="https://<host>/law/<address>"> inside span.lawlink.external -
		// no data-sl-* at all - so none of the routes above matched it and
		// Obsidian opened it as an ordinary external link, landing the reader on
		// the public page although the statute sits in the catalog.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement | null
			const link = target?.closest(LawCitationSelector) as HTMLAnchorElement | null
			if (link == undefined) { return }
			// The two routes that already own their links: an in-document jump,
			// and a citation carrying the full server contract.
			const href = link.getAttribute("href") ?? ""
			if (href.startsWith("#")) { return }
			if (link.closest("a[data-sl-link-kind='external-law']") != undefined) { return }
			const route = routeFromLawHref(href, (link.textContent ?? "").trim())
			if (route == undefined) { return }
			evt.preventDefault()
			evt.stopPropagation()
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined,
				`Law citation click: address=${route.lawAddress || "none"}, target=${route.targetId || "none"}, href=${href}`)
			void this.openLawTarget(route)
		}, true)
		// A span that behaves like a link is given role and tabindex by
		// decorateBacklinkEntries; Enter has to do what the click does.
		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (evt.key != "Enter") { return }
			const target = evt.target as HTMLElement | null
			if (target == undefined || target.tagName == "A") { return }
			const source = findBacklinkSource(target)
			if (source == undefined) { return }
			evt.preventDefault()
			evt.stopPropagation()
			void this.openBacklinkTarget(source)
		}, true)
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target as HTMLElement | null
			const link = target?.closest(".lawlink > a[href^='#']") as HTMLAnchorElement | null
			if (!link) { return }
			const href = link.getAttribute("href") ?? ""
			const encodedTargetId = href.slice(1)
			if (encodedTargetId.length == 0) { return }
			let targetId = encodedTargetId
			try {
				targetId = decodeURIComponent(encodedTargetId)
			} catch (_error) {
				slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `Law link target could not be decoded (href=${href})`)
				return
			}
			const view = this.findMarkdownViewContainingElement(link)
			const semaLogicView = this.findSemaLogicViewContainingElement(link)
			if (semaLogicView != undefined) {
				if (!semaLogicView.navigateToLawLinkTarget(targetId)) {
					slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `Law link target was not found in the SemaLogic result (target=${targetId})`)
					return
				}
				evt.preventDefault()
				evt.stopPropagation()
				evt.stopImmediatePropagation()
				slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, `Navigated law link in SemaLogic result to ${targetId}`)
				return
			}
			if (view == undefined) {
				slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `Law link has no containing Markdown view (target=${targetId})`)
				return
			}
			const targetAttribute = `id="${targetId}"`
			const targetOffset = view.editor.getValue().indexOf(targetAttribute)
			if (targetOffset < 0) {
				slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `Law link target was not found in the current note (target=${targetId})`)
				return
			}
			evt.preventDefault()
			evt.stopPropagation()
			evt.stopImmediatePropagation()
			const targetPosition = view.editor.offsetToPos(targetOffset)
			const editorRoot = link.closest(".cm-editor") as HTMLElement | null
			const codeMirrorView = editorRoot == undefined ? undefined : EditorView.findFromDOM(editorRoot)
			if (codeMirrorView != undefined) {
				const codeMirrorTargetOffset = codeMirrorView.state.doc.toString().indexOf(targetAttribute)
				if (codeMirrorTargetOffset < 0) {
					slconsolelog(DebugLevMap.DebugLevel_Error, undefined, `Law link target was not found in the Live Preview document (target=${targetId})`)
					return
				}
				// A raw HTML block is virtualized as one CodeMirror block, so
				// EditorView.scrollIntoView cannot measure a distant nested section
				// and may jump to the document end. Scroll the actual Live Preview
				// container by the target's source-document proportion instead.
				const maxScrollTop = Math.max(0, codeMirrorView.scrollDOM.scrollHeight - codeMirrorView.scrollDOM.clientHeight)
				const targetRatio = codeMirrorTargetOffset / Math.max(1, codeMirrorView.state.doc.length)
				const targetScrollTop = maxScrollTop * targetRatio
				codeMirrorView.scrollDOM.scrollTop = targetScrollTop
				let alignmentAttempts = 0
				const alignMaterializedTarget = () => {
					codeMirrorView.scrollDOM.scrollTop = targetScrollTop
					const targetElement = Array.from(codeMirrorView.contentDOM.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id == targetId)
					if (targetElement != undefined) {
						targetElement.scrollIntoView({ block: "center" })
						return
					}
					alignmentAttempts += 1
					if (alignmentAttempts < 4) {
						window.requestAnimationFrame(alignMaterializedTarget)
					}
				}
				window.requestAnimationFrame(alignMaterializedTarget)
			} else {
				// Compatibility fallback for editor implementations without .cm.
				view.editor.setCursor(targetPosition)
				view.editor.scrollIntoView({ from: targetPosition, to: targetPosition }, true)
			}
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, `Navigated law link to ${targetId}`)
		}, true);

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
				this.semaLogicUpdate(undefined, true)
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
		this.applySectionStyles()
		this.app.workspace.onLayoutReady(() => {
			this.syncSelectionActionHeaderButtons()
		})

		// This adds a status bar for informations
		this.myStatus = this.addStatusBarItem()

		this.slComm = new SemaLogicPluginComm
		this.slComm.setSLClass(this)
		// Register synchronously while Obsidian restores persisted workspace
		// leaves. Delaying this until onLayoutReady makes a saved SemaLogic leaf
		// unusable and later causes activateView to create a second one.
		this.registerSemaLogicView()
		this.registerLawCatalogView()
		this.registerLawRawView()

		// Workspace leaves are restored after plugins are loaded. Creating the
		// SemaLogic leaf before that point can race the layout restore.
		this.app.workspace.onLayoutReady(() => {
			void this.initializeAfterLayout()
		})

		// add an RibbonIcon to activcate and deactivate the SemaLogicView
		const semaLogicRibbon = this.addRibbonIcon("book", "On/Off SemaLogic.View", () => {
			this.setViews()
			let hasSemaLogicView = false
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view.getViewType() == SemaLogicViewType) {
					hasSemaLogicView = true
				}
			})
			if (!hasSemaLogicView) {
				this.statusSL = true
				this.activateView()
			} else {
				this.statusSL = false
				this.deactivateView();
			}

		});
		semaLogicRibbon.setAttr("data-sl-test", "semalogic-view-toggle")
		this.addCommand({
			id: "sl_open_view",
			name: "UseSemaLogic: open SemaLogic view",
			callback: async () => {
				await this.activateView()
			},
		});
		// WP23a T2 - the picker is reachable from the command palette as well as
		// from the button in the Law view.
		this.addCommand({
			id: "sl_open_law_picker",
			name: "UseSemaLogic: Gesetz laden ...",
			callback: async () => {
				await this.openLawPicker()
			},
		});
		// Diagnosis for an empty picker: what /law/index actually answered.
		this.addCommand({
			id: "sl_check_law_index",
			name: "UseSemaLogic: Gesetzes-Index pruefen",
			callback: async () => {
				await this.describeLawIndex()
			},
		});
		// Diagnosis for a failing load: reports what each of the three routes a
		// statute load talks to actually answers, then runs the load itself
		// without the picker in between.
		this.addCommand({
			id: "sl_load_first_law",
			name: "UseSemaLogic: Ladeweg pruefen (erstes Gesetz)",
			callback: async () => {
				await this.describeLawLoad()
			},
		});
		// WP23a T5 - the Markdown round trip of whatever Law view is in front.
		this.addCommand({
			id: "sl_law_transfer_markdown",
			name: "UseSemaLogic: Transfer as Markdown to Clipboard",
			callback: async () => {
				const view = this.getActiveLawCatalogView()
				if (view == undefined) {
					new Notice("UseSemaLogic: es ist kein Gesetz geladen.")
					return
				}
				await view.transferAsMarkdown()
			},
		});
		this.addCommand({
			id: "sl_toggle_result_source",
			name: "UseSemaLogic: toggle result source mode",
			callback: async () => {
				if (this.slComm?.slview == undefined) {
					new Notice("UseSemaLogic: open the SemaLogic view first.")
					return
				}
				await this.slComm.slview.toggleResultDisplayMode()
			},
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
		// WP23a T2 - the statute picker sits in the ribbon beside the view
		// toggles, not in the law view: a reader opens a statute *before* there
		// is a law view to press a button in.
		const lawRibbon = this.addRibbonIcon("scale", "Gesetz laden ...", () => {
			void this.openLawPicker()
		});
		lawRibbon.setAttr("data-sl-test", "law-picker-ribbon")
		// add an RibbonIcon to activcate and deactivate the Knowledge.View
		const knowledgeRibbon = this.addRibbonIcon("share-2", "On/Off Knowledge.View", () => {
			this.setViews()
			if (this.slComm != undefined) {
				if (this.slComm.activatedKnowledge == false) {
					this.activateKnowledgeView();
				} else {
					this.deactivateKnowledgeView();
				}
			}
		});
		knowledgeRibbon.setAttr("data-sl-test", "knowledge-view-toggle")
		// add an RibbonIcon to activcate and deactivate the SemaLogicView
		//this.addRibbonIcon("file-type-2", "Create TemplateFolder", () => {
		//	createTemplateFolder(app.vault)
		//});

		this.addCommand({
			id: "sl_create_template",
			name: "SemaLogic create template",
			callback: () => {
				createTemplateFolder(this.app.vault);
				createExamples(this.app.vault);
			},
		});

		this.attachCanvasTooltipsToAllLeaves()

		this.addCommand({
			id: "sl_create_test_canvas",
			name: "UseSemaLogic: test canvas simple",
			callback: async () => {
				try {
					await createTestCanvas(this.app.vault)
					new Notice("UseSemaLogic: simple test canvas created.")
					slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "Test canvas fixture created: SemaLogic/TestCanvas.canvas")
				} catch (e) {
					slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, "Test canvas fixture failed", e)
					new Notice("UseSemaLogic: could not create simple test canvas.")
				}
			},
		});
		this.addCommand({
			id: "sl_create_template_canvas",
			name: "UseSemaLogic: test canvas komplex",
			callback: async () => {
				try {
					await createTemplateCanvas(this.app.vault)
					new Notice("UseSemaLogic: complex test canvas created.")
					slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, "Template canvas fixture created: SemaLogic/TemplateCanvas.canvas")
				} catch (e) {
					slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview, "Template canvas fixture failed", e)
					new Notice("UseSemaLogic: could not create complex test canvas.")
				}
			},
		});


		this.registerEditorExtension([EditorView.updateListener.of(this.handleUpdate), slTermHider]);
	}

	private async initializeAfterLayout(): Promise<void> {
		if (this.startupInitialization != undefined) {
			return this.startupInitialization
		}
		this.startupInitialization = (async () => {
			try {
				this.removeDuplicateSemaLogicLeaves()
				this.initializeRestoredLawCatalogViews()
				this.setViews()
				// Reset exactly once, before the first parse. The former startup path
				// issued several reset and parse requests for the same server session.
				await this.activateView(false, false)
				await this.semaLogicReset()
				this.setViews()
				if (this.slComm.slview != undefined) {
					this.slComm.slview.setNewInitial(this.settings.mySLSettings[this.settings.mySetting].myOutputFormat, true)
				}
				await this.semaLogicParse()
			} catch (e) {
				this.lastParsedHash = ""
				slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
					`SemaLogic startup initialization failed: ${e instanceof Error ? e.message : String(e)}`)
			}
		})()
		return this.startupInitialization
	}

	private scheduleAutomaticParseRetry(): void {
		if (this.automaticParseRetry != undefined || !this.pluginEnabled || this.pauseAllRequests) {
			return
		}
		if (this.automaticParseRetryCount >= 3) {
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				"Automatic SemaLogic parse retry limit reached")
			return
		}
		this.automaticParseRetryCount += 1
		const delay = this.automaticParseRetryCount * 1000
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
			`Retry automatic SemaLogic parse in ${delay}ms (attempt ${this.automaticParseRetryCount}/3)`)
		this.automaticParseRetry = window.setTimeout(() => {
			this.automaticParseRetry = undefined
			void this.semaLogicParse().catch((e) => {
				slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
					`Automatic SemaLogic retry failed: ${e instanceof Error ? e.message : String(e)}`)
			})
		}, delay)
	}

	async semaLogicParse(showEditorProgress: boolean = false): Promise<Node[]> {
		if (this.pauseAllRequests) {
			return [];
		}

		this.setViews();
		if (this.slComm?.slview == undefined) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, "Skip SemaLogicParse: slview not ready")
			return [];
		}
		if (this.slComm.slview.getOutPutFormat() == DialectGen_Label) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm.slview, "Skip SemaLogicParse: DialectEngine blocks automatic follow-up requests")
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
		if (newHash == this.lastParsedHash || newHash == this.parseInFlightHash) {
			return results
		}
		this.parseInFlightHash = newHash

		slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "Parsingresult for SemaLogicView")
		const responseForSemaLogic = this.slComm.slview.getSemaLogicParse(
			this.settings,
			vAPI_URL,
			dialectID,
			bodytext,
			false,
			undefined,
			undefined,
			undefined,
			showEditorProgress ? { title: "Editor-Update", startMessage: "Sende geänderten Text an SemaLogic ..." } : undefined
		)
		void responseForSemaLogic.then(value => {
			this.lastParsedHash = newHash
			this.automaticParseRetryCount = 0
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, value)
		}).catch((e) => {
			// Failed input must not be treated as already processed: a later editor
			// update can retry after the SemaLogic service becomes available.
			this.lastParsedHash = ""
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview,
				`Automatic SemaLogic parse failed and will be retried: ${e instanceof Error ? e.message : String(e)}`)
			this.scheduleAutomaticParseRetry()
		}).finally(() => {
			if (this.parseInFlightHash == newHash) {
				this.parseInFlightHash = undefined
			}
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

				const responseForASP = this.slComm.slview.requestSemaLogicParse(this.settings, vAPI_URL, dialectID, bodytext, true, outputFormat)
				responseForASP.then(result => {
					//this.updateTransferOutstanding = true;
					//slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, 'Set UpdateASPOutstanding:' + this.updateTransferOutstanding)
					slconsolelog(DebugLevMap.DebugLevel_Chatty, this.slComm.slview, result.payload.content)
					// The transfer endpoint receives the whole envelope: its top level
					// still carries `rules` and `rulesettype` exactly as before 00.03.00.
					const aspPromise = this.slComm.slaspview.aspParse(this.slComm, this.settings, result.raw, this.slComm.slaspview.LastRequestTime)
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
		// const anchorRe = /<a\b[^>]*\bdata-sl-interpreter\s*=\s*(['\"])1\1[^>]*>([\s\S]*?)<\/a>/gi;
		// return normalizedLegacy.replace(anchorRe, (_m, _quote, inner) => this.decodeHtmlEntities(String(inner ?? "")));
		return normalizedLegacy;
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
		// Decode HTML entities without an unsafe innerHTML sink. The inputs are
		// entity-escaped attribute/anchor text, so DOMParser + textContent is
		// equivalent to the old detached-textarea trick and lint-safe.
		const doc = new DOMParser().parseFromString(text, "text/html");
		return doc.body.textContent ?? "";
	}

	private buildSLInterpreterAnchor(originalText: string, interpretedText: string): string {
		return buildSLInterpreterAnchor(originalText, interpretedText);
	}

	private extractSLInterpreterAnchorData(text: string): { visibleText: string; slText: string } | undefined {
		return extractSLInterpreterAnchorData(text);
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

	private findMarkdownViewContainingElement(element: HTMLElement): MarkdownView | undefined {
		let containingView: MarkdownView | undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (containingView != undefined || !(leaf.view instanceof MarkdownView)) { return }
			if (leaf.view.contentEl.contains(element)) {
				containingView = leaf.view
			}
		})
		return containingView
	}

	private findSemaLogicViewContainingElement(element: HTMLElement): SemaLogicView | undefined {
		let containingView: SemaLogicView | undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (containingView != undefined || !(leaf.view instanceof SemaLogicView)) { return }
			if (leaf.view.contentEl.contains(element)) {
				containingView = leaf.view
			}
		})
		return containingView
	}

	private resolveExternalLawUrl(url: string): string | undefined {
		try {
			return new URL(url, getHostPort(this.settings)).toString()
		} catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`External law URL could not be resolved: ${url}; ${e instanceof Error ? e.message : String(e)}`)
			return undefined
		}
	}

	private createExternalLawRequest(url: string): RequestUrlParam {
		const profile = this.settings.mySLSettings[this.settings.mySetting]
		if (profile.myUseHttpsSL && profile.myUserSL != "") {
			return {
				url,
				method: "GET",
				headers: {
					"Authorization": "Basic " + btoa(profile.myUserSL + ":" + profile.myPasswordSL)
				}
			}
		}
		return { url, method: "GET" }
	}

	// The same request, with extra headers and without requestUrl's throw on
	// 4xx: WP23a needs to read 304 and 404 rather than catch them.
	private createLawApiRequest(url: string, extraHeaders: Record<string, string> = {}): RequestUrlParam {
		const base = this.createExternalLawRequest(url)
		return { ...base, headers: { ...(base.headers ?? {}), ...extraHeaders }, throw: false }
	}

	private lawRequestHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
		const profile = this.settings.mySLSettings[this.settings.mySetting]
		const headers: Record<string, string> = { ...extraHeaders }
		if (profile.myUseHttpsSL && profile.myUserSL != "") {
			headers["Authorization"] = "Basic " + btoa(profile.myUserSL + ":" + profile.myPasswordSL)
		}
		return headers
	}

	// WP23a T1 - the catalog index, fetched on first use rather than at plugin
	// load, and revalidated with its ETag afterwards.
	private getLawIndexStore(): LawIndexStore {
		if (this.lawIndexStore == undefined) {
			this.lawIndexStore = new LawIndexStore(async (etag) => {
				// A bare "/law/index" handed to Obsidian is read as a vault path;
				// WP20a T3's rule is that every Law URL is resolved against the
				// configured API base.
				const url = this.resolveExternalLawUrl(LawIndexRoute)
				if (url == undefined) {
					throw new Error(`the law index URL could not be resolved against ${getHostPort(this.settings)}`)
				}
				const headers: Record<string, string> = {}
				// Cache-Control: no-cache on the route - revalidate, and let the
				// 304 do the work.
				if (etag.length > 0) { headers["If-None-Match"] = etag }
				const response = await requestUrl(this.createLawApiRequest(url, headers))
				return {
					status: response.status,
					text: response.text ?? "",
					etag: lawHeaderValue(response.headers, "ETag")
				}
			})
		}
		return this.lawIndexStore
	}

	// Dropped whenever the configured server may have changed - a different
	// installation has a different catalog and different ETags.
	public resetLawCaches(): void {
		this.lawIndexStore?.reset()
		this.lawIndexUnavailable = false
		this.lawRawDownloadUnavailable = false
		resetLawStreaming()
	}

	// WP23a T2 - the statute picker. 6130 published statutes rule out a dropdown.
	public async openLawPicker(): Promise<void> {
		if (this.lawIndexUnavailable) {
			new Notice("UseSemaLogic: Dieser Server kennt noch keinen Gesetzes-Index.")
			return
		}
		let entries: LawIndexEntry[]
		try {
			entries = await this.getLawIndexStore().load()
		} catch (e) {
			if (e instanceof LawIndexUnavailableError) {
				// The server predates WP23a S1. One clear notice, and the action
				// stays disabled - guessing LawLinks instead is not an option.
				this.lawIndexUnavailable = true
				new Notice("UseSemaLogic: Dieser Server kennt noch keinen Gesetzes-Index.")
				slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
					`Law index route is missing on ${getHostPort(this.settings)}; the statute picker is disabled for this session`)
				return
			}
			new Notice(`UseSemaLogic: Der Gesetzes-Index konnte nicht geladen werden. ${e instanceof Error ? e.message : String(e)}`, 15000)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Law index load failed: ${e instanceof Error ? e.message : String(e)}`)
			return
		}
		slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
			`Law index available with ${entries.length} statute(s)`)
		if (entries.length == 0) {
			// An empty picker is indistinguishable from a broken one, so it is
			// never opened: the catalog is empty, and that is what gets said.
			new Notice("UseSemaLogic: Der Gesetzes-Index dieses Servers enthaelt keine Gesetze. "
				+ "Details liefert das Kommando \"UseSemaLogic: Gesetzes-Index pruefen\".")
			return
		}
		new LawPickerModal(this.app, entries, this.settings.lawRecents ?? [], (entry) => {
			// Without this catch a throw on the way to the request would be an
			// unhandled rejection: silent, and indistinguishable from a click
			// that never arrived.
			void this.openLawStatute(entry).catch((e) => {
				this.lawLoadProgress.stop()
				const message = e instanceof Error ? e.message : String(e)
				new Notice(`UseSemaLogic: ${entry.abbreviation || entry.lawId} konnte nicht geoeffnet werden. ${message}`, 15000)
				console.error("UseSemaLogic: openLawStatute failed", e)
			})
		}).open()
	}

	// WP23a T3/T4 - open the chosen statute.
	//
	// The statute lands as an ordinary Markdown tab in the main editor area, not
	// in a plugin view. That forces a real file: Obsidian has no way to show an
	// in-memory string as a standard Markdown view. The note's frontmatter is
	// therefore the cache - it records the artifact and its ETag, so re-opening
	// the same statute revalidates and leaves an unchanged note untouched.
	public async openLawStatute(entry: LawIndexEntry): Promise<void> {
		const name = entry.abbreviation || entry.title || entry.lawId
		// Checked before the overlay is touched: starting a second one would take
		// the running load's progress display away from it.
		if (this.lawLoadInFlight != undefined) {
			new Notice(`UseSemaLogic: ${this.lawLoadInFlight} wird bereits geladen.`)
			return
		}
		// From here the overlay comes up before anything can go wrong, so that
		// choosing a statute always produces something visible.
		this.lawLoadProgress.start("Gesetz laden", `${name} wird geladen ...`)
		this.lawLoadInFlight = name
		try {
			const notePath = normalizePath(lawNotePath(entry.abbreviation, entry.lawId))
			const existing = this.app.vault.getAbstractFileByPath(notePath)
			const existingFile = existing instanceof TFile ? existing : undefined
			const existingMeta = existingFile != undefined
				? readLawNoteMeta(await this.app.vault.read(existingFile))
				: undefined

			const fetched = await this.fetchLawMarkdown(entry, existingMeta)
			if (fetched == undefined) { return }

			if (fetched.unchanged && existingFile != undefined) {
				// The note already holds this version; opening it is the whole job.
				await this.openNoteInMarkdownArea(existingFile)
				await this.rememberLawStatute(entry.lawId)
				new Notice(`UseSemaLogic: ${name} ist unveraendert - vorhandene Notiz geoeffnet.`)
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
					`Law note revalidated with 304 (lawId=${entry.lawId}, path=${notePath}, source=${fetched.source})`)
				return
			}

			const note = buildLawNote(fetched.markdown, {
				lawId: fetched.lawId,
				abbreviation: entry.abbreviation,
				title: entry.title,
				version: fetched.version,
				source: fetched.source,
				etag: fetched.etag,
				retrieved: new Date().toISOString()
			})
			const file = await this.writeLawNote(notePath, note, existingFile)
			await this.openNoteInMarkdownArea(file)
			await this.rememberLawStatute(entry.lawId)
			new Notice(`UseSemaLogic: ${name} geladen - ${formatLawByteSize(utf8ByteLength(fetched.markdown))}`
				+ ` (${fetched.source == "raw.md" ? "Originalquelle" : "Deannotate"})`)
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
				`Law note written (lawId=${fetched.lawId}, path=${notePath}, source=${fetched.source},`
				+ ` version=${fetched.version || "unknown"}, bytes=${fetched.markdown.length})`)
		} catch (e) {
			// Nothing partial is left behind: the note is written in one go, and
			// only after the bytes are in hand.
			const message = e instanceof Error ? e.message : String(e)
			this.showLawRetryNotice(`UseSemaLogic: ${name} konnte nicht geladen werden. ${message}`, () => {
				void this.openLawStatute(entry)
			})
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Law statute load failed (lawId=${entry.lawId}): ${message}`)
		} finally {
			this.lawLoadProgress.stop()
			this.lawLoadInFlight = undefined
		}
	}

	// Fetches the statute as Markdown, preferring the imported source and falling
	// back to the round trip of the served document. `undefined` means the load
	// was handled and abandoned (the statute is gone from the repository).
	private async fetchLawMarkdown(entry: LawIndexEntry,
		existingMeta: Partial<LawNoteMeta> | undefined): Promise<LawMarkdownResult | undefined> {
		const name = entry.abbreviation || entry.title || entry.lawId

		// 1. The imported source. WP23 SS3's route is fixed, so it is asked
		// directly instead of first pulling an 11 MB document to read a header off
		// it. The whole route is optional, and a server that does not have it
		// answers in more than one way: 404 where the route exists but this
		// statute has no raw stage, and 400 where there is no such route at all
		// and the path fell through to the LawLink address parser. Neither is a
		// reason to abandon the load - both mean "use the other artifact".
		const rawUrl = this.lawRawDownloadUnavailable
			? undefined
			: this.resolveExternalLawUrl(`/law/download/${encodeURIComponent(entry.lawId)}/raw.md`)
		if (rawUrl != undefined) {
			const rawEtag = lawNoteRevalidationEtag(existingMeta, "raw.md")
			const raw = await this.fetchLawBytes(rawUrl, rawEtag, `${name} (Originalquelle)`)
			if (raw.status == 304 && rawEtag.length > 0) {
				return { markdown: "", source: "raw.md", etag: rawEtag, version: existingMeta?.version ?? "", lawId: entry.lawId, unchanged: true }
			}
			if (raw.status >= 200 && raw.status < 300) {
				return {
					markdown: raw.text,
					source: "raw.md",
					etag: lawHeaderValue(raw.headers, "ETag"),
					version: lawHeaderValue(raw.headers, "X-SL-Version"),
					lawId: lawHeaderValue(raw.headers, "X-SL-Law-Id") || entry.lawId,
					unchanged: false
				}
			}
			if (raw.status >= 500) {
				// The route is there and broke; that is worth reporting.
				throw new Error(`HTTP ${raw.status} von /law/download/<id>/raw.md`)
			}
			if (raw.status == 404) {
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
					`No raw stage for ${entry.lawId}; falling back to the deannotate round trip`)
			} else {
				// 400, 405, 501 ...: this installation does not understand the
				// route. Asking again for every further statute is wasted, so it
				// is asked once per session.
				this.lawRawDownloadUnavailable = true
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
					`The raw source route answered HTTP ${raw.status}; this server does not serve it,`
					+ ` using the deannotate round trip for the rest of the session`)
			}
		}

		// 2. The round trip of the served document.
		const docUrl = this.resolveExternalLawUrl(lawDocumentRoute(entry.lawId))
		if (docUrl == undefined) {
			throw new Error(`die Adresse von ${name} konnte nicht aufgeloest werden`)
		}
		const docEtag = lawNoteRevalidationEtag(existingMeta, "deannotate")
		const doc = await this.fetchLawBytes(docUrl, docEtag, name)
		if (doc.status == 304 && docEtag.length > 0) {
			return { markdown: "", source: "deannotate", etag: docEtag, version: existingMeta?.version ?? "", lawId: entry.lawId, unchanged: true }
		}
		if (doc.status == 404) {
			// The catalog and the repository disagree: a check-in can change what is
			// held after the index was fetched.
			new Notice(`UseSemaLogic: ${name} ist auf diesem Server nicht verfuegbar.`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Law document is gone from the repository (lawId=${entry.lawId}); revalidating the index`)
			await this.revalidateLawIndexAndReopenPicker()
			return undefined
		}
		if (doc.status < 200 || doc.status >= 300) {
			throw new Error(`HTTP ${doc.status} von /law/doc/<id>?view=snapshot`)
		}
		this.lawLoadProgress.setMessage(`${name} wird nach Markdown gewandelt ...`)
		this.lawLoadProgress.update(0, 0)
		const deannotated = await deannotateLawHtml(this.settings, doc.text)
		if (deannotated.mediaType != "text/markdown") {
			throw new Error(`der Dienst lieferte ${deannotated.mediaType || "einen unbekannten Typ"} statt Markdown`
				+ " - das Dokument wurde nicht als annotiertes HTML erkannt")
		}
		if (deannotated.markdown.length == 0) {
			throw new Error("der Dienst lieferte kein Markdown zurueck")
		}
		return {
			markdown: deannotated.markdown,
			source: "deannotate",
			etag: lawHeaderValue(doc.headers, "ETag"),
			version: lawHeaderValue(doc.headers, "X-SL-Version"),
			lawId: lawHeaderValue(doc.headers, "X-SL-Law-Id") || entry.lawId,
			unchanged: false
		}
	}

	// One conditional GET with byte progress where the platform allows it, and
	// requestUrl as the fallback that always works.
	private async fetchLawBytes(url: string, etag: string, label: string): Promise<LawStreamResponse> {
		this.lawLoadProgress.setMessage(`${label} wird geladen ...`)
		this.lawLoadProgress.update(0, 0)
		const conditional: Record<string, string> = {}
		if (etag.length > 0) { conditional["If-None-Match"] = etag }
		const headers = this.lawRequestHeaders(conditional)
		const streamed = await fetchLawDocumentStreaming(url, headers,
			(loaded, total) => this.lawLoadProgress.update(loaded, total))
		if (streamed != undefined) { return streamed }
		this.lawLoadProgress.update(0, 0)
		const buffered = await requestUrl(this.createLawApiRequest(url, headers))
		return { status: buffered.status, text: buffered.text ?? "", headers: buffered.headers ?? {} }
	}

	private async writeLawNote(path: string, content: string, existingFile: TFile | undefined): Promise<TFile> {
		if (existingFile != undefined) {
			await this.app.vault.modify(existingFile, content)
			return existingFile
		}
		const folder = path.split("/").slice(0, -1).join("/")
		if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
			await this.app.vault.createFolder(folder)
		}
		const created = await this.app.vault.create(path, content)
		return created
	}

	// Opens the note where Obsidian's own Markdown tabs live: a new tab in the
	// main area, in a group that is not holding one of this plugin's views.
	private async openNoteInMarkdownArea(file: TFile): Promise<void> {
		// An already open tab for this note wins over a second one.
		let openLeaf: WorkspaceLeaf | undefined
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (openLeaf != undefined || !(leaf.view instanceof MarkdownView)) { return }
			if (leaf.view.file?.path == file.path) { openLeaf = leaf }
		})
		if (openLeaf != undefined) {
			this.app.workspace.setActiveLeaf(openLeaf, { focus: true })
			this.app.workspace.revealLeaf(openLeaf)
			return
		}
		const host = this.findMarkdownAreaLeaf()
		if (host != undefined) {
			// getLeaf("tab") opens beside the active leaf, so the group is chosen by
			// making a non-plugin leaf active first.
			this.app.workspace.setActiveLeaf(host, { focus: false })
		}
		const leaf = this.app.workspace.getLeaf("tab")
		await leaf.openFile(file)
		this.app.workspace.revealLeaf(leaf)
	}

	// The most recent leaf in the main area that is not a SemaLogic view. The
	// SemaLogic view lives in its own split, and a statute must not land there.
	private findMarkdownAreaLeaf(): WorkspaceLeaf | undefined {
		const recent = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)
		if (recent != null && !(recent.view instanceof SemaLogicView) && !(recent.view instanceof ASPView)) {
			return recent
		}
		let candidate: WorkspaceLeaf | undefined
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (candidate != undefined) { return }
			if (leaf.view instanceof SemaLogicView || leaf.view instanceof ASPView) { return }
			candidate = leaf
		})
		return candidate
	}

	// Diagnosis for "the picker shows nothing". Reports what the route actually
	// answered rather than what the client made of it: the resolved URL, the
	// status, the payload size, the declared schema, the row count and the first
	// row verbatim. Written to the console *and* shown as a notice, because the
	// plugin's own logging is silent at the default debug level.
	public async describeLawIndex(): Promise<void> {
		const url = this.resolveExternalLawUrl(LawIndexRoute)
		if (url == undefined) {
			new Notice(`UseSemaLogic: /law/index laesst sich nicht gegen ${getHostPort(this.settings)} aufloesen.`)
			return
		}
		const lines: string[] = [`GET ${url}`]
		try {
			// Deliberately unconditional: a 304 would report nothing useful here.
			const response = await requestUrl(this.createLawApiRequest(url))
			const body = response.text ?? ""
			lines.push(`Status ${response.status}`)
			lines.push(`Content-Type ${lawHeaderValue(response.headers, "Content-Type") || "(keiner)"}`)
			lines.push(`ETag ${lawHeaderValue(response.headers, "ETag") || "(keiner)"}`)
			lines.push(`${formatLawByteSize(body.length)} Rumpf`)
			if (response.status == 200) {
				let parsedBody: any
				try {
					parsedBody = JSON.parse(body)
				} catch (e) {
					lines.push(`Rumpf ist kein JSON: ${body.slice(0, 200)}`)
					parsedBody = undefined
				}
				if (parsedBody != undefined) {
					lines.push(`schema "${parsedBody.schema ?? "(fehlt)"}"`)
					lines.push(`Schluessel: ${Object.keys(parsedBody).join(", ") || "(keine)"}`)
					const statutes = parsedBody.statutes
					if (Array.isArray(statutes)) {
						lines.push(`${statutes.length} Zeile(n)`)
						if (statutes.length > 0) {
							lines.push(`erste Zeile: ${JSON.stringify(statutes[0]).slice(0, 200)}`)
							lines.push(makeLawIndexEntry(statutes[0]) != undefined
								? "erste Zeile ist lesbar"
								: "erste Zeile konnte NICHT gelesen werden - die Zeilenform passt nicht")
						}
					} else {
						lines.push(`"statutes" ist ${statutes == undefined ? "nicht vorhanden" : typeof statutes}, kein Array`)
					}
				}
			}
		} catch (e) {
			lines.push(`Transportfehler: ${e instanceof Error ? e.message : String(e)}`)
		}
		const report = lines.join("\n")
		// console.log directly: slconsolelog stays silent while myDebugLevel is 0,
		// and this command exists precisely for the case where nothing is visible.
		console.log("UseSemaLogic law index check\n" + report)
		new Notice(`UseSemaLogic Gesetzes-Index:\n${report}`, 30000)
	}

	// Probes every route a statute load uses and reports each status, then loads.
	// A bare "HTTP 400" does not say which of the three refused; this does.
	public async describeLawLoad(): Promise<void> {
		const lines: string[] = []
		let first: LawIndexEntry | undefined
		try {
			const entries = await this.getLawIndexStore().load()
			first = this.settings.lawRecents?.length > 0
				? entries.find((entry) => entry.lawId == this.settings.lawRecents[0] && entry.held)
				: undefined
			if (first == undefined) { first = entries.find((entry) => entry.held) }
			if (first == undefined) {
				new Notice(`UseSemaLogic: keines der ${entries.length} Gesetze im Index ist auf diesem Server vorhanden (held).`, 15000)
				return
			}
			lines.push(`Gesetz: ${first.abbreviation || first.lawId} (${first.lawId})`)

			const rawUrl = this.resolveExternalLawUrl(`/law/download/${encodeURIComponent(first.lawId)}/raw.md`)
			if (rawUrl != undefined) {
				const raw = await requestUrl(this.createLawApiRequest(rawUrl))
				lines.push(`GET /law/download/<id>/raw.md -> ${raw.status}`
					+ (raw.status == 200 ? ` (${formatLawByteSize((raw.text ?? "").length)})` : ""))
				if (raw.status != 200 && raw.status != 404) {
					lines.push("  -> diese Route kennt der Server nicht; es wird deannotiert")
				}
			}

			const docUrl = this.resolveExternalLawUrl(`/law/doc/${encodeURIComponent(first.lawId)}?view=snapshot`)
			let html = ""
			if (docUrl != undefined) {
				const doc = await requestUrl(this.createLawApiRequest(docUrl))
				html = doc.text ?? ""
				lines.push(`GET /law/doc/<id>?view=snapshot -> ${doc.status}`
					+ (doc.status == 200 ? ` (${formatLawByteSize(html.length)})` : ""))
			}

			if (html.length > 0) {
				try {
					const deannotated = await deannotateLawHtml(this.settings, html)
					lines.push(`POST /rules/parse -> mediaType ${deannotated.mediaType || "(keiner)"},`
						+ ` ${formatLawByteSize(utf8ByteLength(deannotated.markdown))} Markdown`)
				} catch (e) {
					lines.push(`POST /rules/parse -> ${e instanceof Error ? e.message : String(e)}`)
				}
			}
		} catch (e) {
			lines.push(`Abbruch: ${e instanceof Error ? e.message : String(e)}`)
		}
		const report = lines.join("\n")
		console.log("UseSemaLogic law load check\n" + report)
		new Notice(`UseSemaLogic Ladeweg:\n${report}`, 30000)
		if (first != undefined) { await this.openLawStatute(first) }
	}

	private async revalidateLawIndexAndReopenPicker(): Promise<void> {
		this.lawLoadProgress.setMessage("Gesetzes-Index wird aktualisiert ...")
		this.lawLoadProgress.update(0, 0)
		try {
			await this.getLawIndexStore().load(true)
		} catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Law index revalidation failed: ${e instanceof Error ? e.message : String(e)}`)
		}
		await this.openLawPicker()
	}

	// A Notice with an action: the retry has to be one click away, not a repeat
	// of the whole picker flow.
	private showLawRetryNotice(message: string, retry: () => void): void {
		const fragment = document.createDocumentFragment()
		fragment.createEl("div", { text: message })
		const action = fragment.createEl("a", { text: "Erneut versuchen", cls: "sl-notice-action" })
		action.setAttr("href", "#")
		const notice = new Notice(fragment, 15000)
		action.addEventListener("click", (evt) => {
			evt.preventDefault()
			notice.hide()
			retry()
		})
	}

	private async rememberLawStatute(lawId: string): Promise<void> {
		const previous = this.settings.lawRecents ?? []
		const recents = rememberLawRecent(previous, lawId)
		// Element-wise: the order is what the empty-query list shows, so an
		// unchanged order must not cost a settings write.
		if (recents.length == previous.length && recents.every((id, index) => id == previous[index])) { return }
		this.settings.lawRecents = recents
		await this.saveData(this.settings)
	}

	// WP23 SS3 / WP23a T6 - the *other* Markdown artifact: the imported source
	// of the statute, byte for byte, opened in its own tab. It is never a
	// stand-in for the Deannotate round trip and vice versa.
	public async openLawRawMarkdown(rawDownloadUrl: string, identity: LawDocumentIdentity, title: string): Promise<void> {
		const url = this.resolveExternalLawUrl(rawDownloadUrl)
		if (url == undefined) {
			new Notice(`UseSemaLogic: die Adresse des Original-Markdowns von ${title} konnte nicht aufgeloest werden.`)
			return
		}
		const existing = this.findLawRawView(url)
		if (existing != undefined) {
			this.app.workspace.revealLeaf(existing.leaf)
			return
		}
		this.lawLoadProgress.start("Original-Markdown", `${title} (raw.md) wird geladen ...`)
		let status: number | undefined
		try {
			const response = await requestUrl(this.createLawApiRequest(url))
			status = response.status
			if (response.status == 404) {
				// The advertised action outlived the bundle it pointed at. Do not
				// fall back to another stage - that would label a different
				// artifact as the original source.
				new Notice(`UseSemaLogic: das Original-Markdown von ${title} ist nicht mehr verfuegbar.`)
				return
			}
			if (response.status < 200 || response.status >= 300) {
				throw new Error(`HTTP ${response.status}`)
			}
			const markdown = response.text ?? ""
			const fileName = this.lawRawFileName(response.headers, url, identity.lawId)
			this.registerLawRawView()
			const leaf = this.app.workspace.getLeaf("tab")
			await leaf.setViewState({ type: LawRawViewType, active: true })
			const rawView = leaf.view
			if (!(rawView instanceof LawRawMarkdownView)) {
				throw new Error(`the raw markdown view could not be created (got ${leaf.view.getViewType()})`)
			}
			rawView.setComm(this.slComm)
			rawView.showRawMarkdown(markdown, url, {
				lawId: lawHeaderValue(response.headers, "X-SL-Law-Id") || identity.lawId,
				version: lawHeaderValue(response.headers, "X-SL-Version") || identity.version,
				abbreviation: identity.abbreviation,
				fileName
			})
			this.app.workspace.revealLeaf(leaf)
			new Notice(`UseSemaLogic: ${fileName} geladen - ${formatLawByteSize(response.arrayBuffer?.byteLength ?? markdown.length)}`)
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
				`Law raw markdown opened (lawId=${identity.lawId}, file=${fileName}, bytes=${markdown.length})`)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			new Notice(`UseSemaLogic: das Original-Markdown von ${title} konnte nicht geladen werden. ${message}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Law raw markdown failed (lawId=${identity.lawId}, status=${status ?? "transport error"}): ${message}`)
		} finally {
			this.lawLoadProgress.stop()
		}
	}

	// The name the server itself gave the download. Content-Disposition is the
	// authority - the bundle's stage files are named per statute and are
	// resolved server side, so no fixed stage name is assumed here. The route's
	// own document segment is the fallback, and the canonical document id the
	// last resort; caller-supplied text never becomes a file name.
	private lawRawFileName(headers: Record<string, string> | undefined, url: string, lawId: string): string {
		const disposition = lawHeaderValue(headers, "Content-Disposition")
		const quoted = /filename\s*=\s*"([^"]+)"/i.exec(disposition)
		const bare = /filename\s*=\s*([^;]+)/i.exec(disposition)
		const advertised = (quoted?.[1] ?? bare?.[1] ?? "").trim()
		// Only the base name, and only if it is one: a header must not be able
		// to steer anything path-shaped.
		if (advertised.length > 0 && !/[\/]/.test(advertised)) { return advertised }
		try {
			const segments = new URL(url).pathname.split("/").filter((segment) => segment.length > 0)
			const docSegment = segments.length >= 2 ? decodeURIComponent(segments[segments.length - 2]) : lawId
			return `${docSegment || lawId}.raw.md`
		} catch (e) {
			return `${lawId}.raw.md`
		}
	}

	// Obsidian 1.7.2 and later restore workspace leaves *deferred*: the leaf
	// reports its real view type while `leaf.view` is a placeholder that carries
	// none of the view's methods. getViewType() is therefore not proof of an
	// instance - only instanceof is - and every lookup below relies on that.
	private static isDeferredLeaf(leaf: WorkspaceLeaf): boolean {
		return (leaf as unknown as { isDeferred?: boolean }).isDeferred === true
	}

	// Turns a deferred leaf into a real view. Absent on older Obsidian versions,
	// where nothing is deferred in the first place.
	private async loadDeferredLeaf(leaf: WorkspaceLeaf): Promise<void> {
		const loader = (leaf as unknown as { loadIfDeferred?: () => Promise<void> }).loadIfDeferred
		if (typeof loader == "function") { await loader.call(leaf) }
	}

	// The Law view the reader is looking at, or the only one that is open.
	private getActiveLawCatalogView(): LawCatalogView | undefined {
		const active = this.app.workspace.getActiveViewOfType(LawCatalogView)
		if (active != null) { return active }
		let single: LawCatalogView | undefined
		let count = 0
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!(leaf.view instanceof LawCatalogView)) { return }
			count++
			single = leaf.view
		})
		return count == 1 ? single : undefined
	}

	private findLawRawView(downloadUrl: string): { leaf: WorkspaceLeaf; view: LawRawMarkdownView } | undefined {
		let found: { leaf: WorkspaceLeaf; view: LawRawMarkdownView } | undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			// A deferred leaf cannot be asked which document it holds without
			// being loaded first; it is skipped, and a fresh tab is opened.
			if (found != undefined || !(leaf.view instanceof LawRawMarkdownView)) { return }
			if (leaf.view.isRawDocument(downloadUrl)) {
				found = { leaf, view: leaf.view }
			}
		})
		return found
	}

	private async openExternalLawLink(link: HTMLAnchorElement): Promise<void> {
		// All routing data is supplied by the server. In particular, do not infer
		// a provision from the anchor text or from its resolver href.
		//
		// data-sl-target-id is mandatory for a citation (WORKPACKAGE_EXTERNAL_LAW_LINKS):
		// the link names a provision, and opening the statute at its first line
		// would answer a different question than the reader asked. The check
		// belongs here rather than in openLawTarget, which also serves routes
		// that legitimately address a whole document.
		const title = link.dataset.slLawTitle || link.dataset.slLawId || "statute"
		if ((link.dataset.slTargetId ?? "").length == 0) {
			new Notice(`UseSemaLogic: no provision target is available for ${title}.`)
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
				`External law link without data-sl-target-id: ${link.outerHTML.slice(0, 300)}`)
			return
		}
		await this.openLawTarget({
			catalogUrl: link.dataset.slCatalogUrl ?? "",
			giiUrl: link.dataset.slGiiUrl ?? "",
			targetId: link.dataset.slTargetId ?? "",
			lawId: link.dataset.slLawId ?? "",
			lawTitle: link.dataset.slLawTitle ?? "",
			label: (link.textContent ?? "").trim(),
			lawAddress: "",
			resolverUrl: ""
		})
	}

	// The one implementation behind every route that leaves the current
	// document: the catalog document first, the public GII address second, and
	// an already open law tab reused rather than duplicated.
	private async openLawTarget(route: LawLinkRoute): Promise<void> {
		const catalogUrl = route.catalogUrl
		const giiUrl = route.giiUrl
		const targetId = route.targetId
		const lawId = route.lawId
		// The server's own name first, its identity second, the entry's visible
		// text last - a tab called "statute" tells the reader nothing.
		const title = route.lawTitle || lawId || route.label || "statute"

		// The catalog is always preferred, and a route that named only the statute
		// still gets a catalog attempt: /law/doc/<lawId> is where the picker loads
		// every statute from. GII is the fallback, never the first choice.
		const catalogCandidates: string[] = []
		if (catalogUrl.length > 0) { catalogCandidates.push(catalogUrl) }
		if (lawId.length > 0) {
			const byLawId = lawDocumentRoute(lawId)
			if (!catalogCandidates.includes(byLawId)) { catalogCandidates.push(byLawId) }
		}

		// Kept so the reader can be told which attempt failed and how, rather
		// than only that something else opened.
		const failures: string[] = []

		// A reference carries a /law/<address>, which resolves to the public
		// page. The statute it names is still in the catalog, so the address is
		// matched against the index and the catalog document asked for instead.
		if (route.lawAddress.length > 0) {
			const addressLawId = await this.lawIdForAddress(route.lawAddress)
			if (addressLawId.length > 0) {
				const byAddress = lawDocumentRoute(addressLawId)
				if (!catalogCandidates.includes(byAddress)) { catalogCandidates.push(byAddress) }
			} else {
				failures.push(`${route.lawAddress}: im Gesetzes-Index nicht gefunden`)
			}
		}
		for (const candidate of catalogCandidates) {
			const resolvedCatalogUrl = this.resolveExternalLawUrl(candidate)
			if (resolvedCatalogUrl == undefined) {
				failures.push(`${candidate}: nicht aufloesbar`)
				continue
			}
			const existingView = this.findLawCatalogView(resolvedCatalogUrl)
			if (existingView != undefined) {
				// Without a node address the tab itself is the answer; asking
				// navigateToProvision for "" would report a missing provision
				// that was never named.
				if (targetId.length > 0) {
					existingView.view.navigateToProvision(targetId)
				}
				this.app.workspace.revealLeaf(existingView.leaf)
				return
			}
			let responseStatus: number | undefined
			// This route opens a LawView directly, rather than going through the
			// statute picker. Give it the same visible progress feedback: the
			// current statute is named while its document arrives, and the byte
			// counter becomes determinate where the server supplies Content-Length.
			this.lawLoadProgress.start("LawView laden", `${title} wird vorbereitet ...`)
			try {
				const response = await this.fetchLawBytes(resolvedCatalogUrl, "", `${title} (Gesetzestext)`)
				responseStatus = response.status
				if (response.status < 200 || response.status >= 300) {
					throw new Error(`HTTP ${response.status}`)
				}
				this.lawLoadProgress.setMessage(`${title} wird fuer die LawView aufbereitet ...`)
				const servedLawId = lawHeaderValue(response.headers, "X-SL-Law-Id") || lawId
				// Two different strings on purpose (issues-private/01): tab captions
				// are narrow, so the caption is the short designation and the full
				// title stays in the view header. The served document names itself
				// on its root element, and that beats every other source - a
				// data-sl-law-id reads "DE.GESETZ.AUFENTHG" where the document says
				// "AufenthG". The anchor text is a citation, not a statute's name,
				// and becomes neither.
				const servedTitles = readLawDocumentTitles(response.text ?? "")
				const shortName = servedTitles.shortTitle || lawId || servedLawId || "Law"
				const documentTitle = servedTitles.title || route.lawTitle || shortName
				this.lawLoadProgress.setMessage(`${documentTitle} wird in der LawView geoeffnet ...`)
				await this.openLawCatalogDocument(documentTitle, resolvedCatalogUrl, response.text ?? "", targetId, {
					lawId: servedLawId,
					version: lawHeaderValue(response.headers, "X-SL-Version"),
					abbreviation: shortName
				}, lawHeaderValue(response.headers, "X-SL-Raw-Download"))
				return
			} catch (e) {
				failures.push(`${candidate}: ${responseStatus ?? "Transportfehler"}`)
				// undefined, not slComm.slview: routed through a view this line is
				// dropped whenever that view has inline debugging on, and it is the
				// one line that says whether a GII fallback was the server's doing
				// or the client's.
				slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
					`Catalog law document failed (url=${resolvedCatalogUrl}, status=${responseStatus ?? "transport error"}): ${e instanceof Error ? e.message : String(e)}`)
				slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
					{ url: resolvedCatalogUrl, method: "GET", responseStatus })
			} finally {
				this.lawLoadProgress.stop()
			}
		}

		// Everything above stays inside the vault. What is left leaves it: the
		// named public address, or the service's own resolver, which answers 302
		// to the public page. Both are last resorts, never a first choice.
		const publicUrl = giiUrl.length > 0
			? giiUrl
			: (route.resolverUrl.length > 0 ? this.resolveExternalLawUrl(route.resolverUrl) ?? "" : "")
		if (publicUrl.length > 0) {
			// Leaving Obsidian is a visible event and needs a visible reason: the
			// catalog is preferred, so reaching this line always means either the
			// link named no catalog address or every catalog request failed.
			const reason = failures.length > 0
				? `der Katalog antwortete ${failures.join("; ")}`
				: "der Verweis nennt keine Katalog-Adresse und kein Gesetzeskennzeichen"
			new Notice(`UseSemaLogic: ${title} kommt nicht aus dem Katalog (${reason});`
				+ " geoeffnet wird Gesetze im Internet.", 10000)
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
				`Falling back to the public page for ${title} (${reason}; url=${publicUrl})`)
			window.open(publicUrl, "_blank", "noopener,noreferrer")
			return
		}
		new Notice(`UseSemaLogic: ${title} could not be opened.`)
		slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
			`Law target has neither a catalog nor a public address (lawId=${lawId || "unknown"}, target=${targetId || "none"};`
			+ ` catalog attempts: ${failures.length > 0 ? failures.join("; ") : "none"})`)
	}

	// A clicked entry of the reference list. Two outcomes, decided by where the
	// citing provision is rather than by how the entry looks: inside the open
	// document it is a jump, anywhere else it is the external law route, which
	// opens a law tab or reuses the one that already holds that statute.
	private async openBacklinkTarget(source: HTMLElement): Promise<void> {
		const route = resolveBacklinkRoute(source)
		if (route == undefined) {
			// Deliberately not a guess: such an entry names its provision in words
			// only, and turning that label back into an address is exactly what
			// must not happen. The markup is logged so the missing server
			// attributes can be named (docs/WORKPACKAGE_EXTERNAL_LAW_LINKS.md).
			// undefined, not slComm.slview: routed through a view, this line is
			// dropped whenever that view is not the SemaLogic view or has inline
			// debugging on - and a diagnostic that hides is worse than none.
			new Notice("UseSemaLogic: zu diesem Verweis liefert der Dienst kein Sprungziel."
				+ " Das Markup des Eintrags steht im Log (Entwicklerkonsole).")
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
				`Backlink entry without routing data: ${backlinkEntryMarkup(source)}`)
			return
		}
		// Every backlink click is traceable: the entry as the server wrote it and
		// what could be read out of it, so a half-addressed entry can be named
		// instead of guessed at.
		slconsolelog(route.targetId.length > 0 ? DebugLevMap.DebugLevel_Informative : DebugLevMap.DebugLevel_Error,
			undefined, `Backlink click: target=${route.targetId || "none"}, lawId=${route.lawId || "none"},`
			+ ` catalogUrl=${route.catalogUrl || "none"}, giiUrl=${route.giiUrl || "none"};`
			+ ` entry=${backlinkEntryMarkup(source)}`)
		const view = this.findSemaLogicViewContainingElement(source)
		if (route.targetId.length > 0 && view != undefined && view.hasLawLinkTarget(route.targetId)) {
			if (view instanceof LawCatalogView) {
				view.navigateToProvision(route.targetId)
			} else {
				view.navigateToLawLinkTarget(route.targetId)
			}
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined,
				`Navigated a backlink inside the open document (target=${route.targetId})`)
			return
		}
		// Another statute: the external law route, which prefers the catalog and
		// falls back on the statute's own /law/doc address before it ever leaves
		// Obsidian.
		if (route.catalogUrl.length == 0 && route.lawId.length == 0
			&& route.giiUrl.length == 0 && route.lawAddress.length == 0) {
			new Notice(`UseSemaLogic: ${route.targetId || "dieser Verweis"} steht nicht in diesem Dokument,`
				+ " und der Verweis nennt kein anderes Gesetz.")
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
				`Backlink target is neither in the open document nor addressable elsewhere (target=${route.targetId || "none"})`)
			return
		}
		await this.openLawTarget(route)
	}

	// Which statute a node address belongs to. Only the catalog knows where a
	// lawId ends and the node path begins, and the session already holds the
	// index for the picker. A server without the index route leaves the address
	// unresolvable - reported, not guessed around.
	private async lawIdForAddress(address: string): Promise<string> {
		try {
			const entries = await this.getLawIndexStore().load()
			const lawId = lawIdForAddress(address, entries.map((entry) => entry.lawId))
			if (lawId.length == 0) {
				slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
					`No catalog statute matches the address ${address} (${entries.length} statutes known)`)
			}
			return lawId
		} catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
				`The law index could not be consulted for ${address}: ${e instanceof Error ? e.message : String(e)}`)
			return ""
		}
	}

	private findLawCatalogView(catalogUrl: string): { leaf: WorkspaceLeaf; view: LawCatalogView } | undefined {
		let found: { leaf: WorkspaceLeaf; view: LawCatalogView } | undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			// Same as above: a deferred leaf reports the right view type but has
			// no isCatalogDocument to ask. Skipping it costs one extra tab; not
			// skipping it threw "view.isCatalogDocument is not a function".
			if (found != undefined || !(leaf.view instanceof LawCatalogView)) { return }
			if (leaf.view.isCatalogDocument(catalogUrl)) {
				found = { leaf, view: leaf.view }
			}
		})
		return found
	}

	private async openLawCatalogDocument(title: string, catalogUrl: string, fragment: string, targetId: string,
		identity?: LawDocumentIdentity, rawDownloadUrl: string = ""): Promise<void> {
		this.registerLawCatalogView()
		const leaf = this.app.workspace.getLeaf("tab")
		await leaf.setViewState({ type: LawCatalogViewType, active: true })
		const catalogView = leaf.view
		if (!(catalogView instanceof LawCatalogView)) {
			// setViewState is supposed to instantiate the registered view; if it
			// did not, say so rather than failing later on a missing method.
			throw new Error(`the law view could not be created (got ${leaf.view.getViewType()})`)
		}
		catalogView.setComm(this.slComm)
		catalogView.showLawDocument(title, catalogUrl, fragment, targetId, identity, rawDownloadUrl)
		this.app.workspace.revealLeaf(leaf)
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

		const dialectV1Btn = document.createElement("button")
		dialectV1Btn.type = "button"
		dialectV1Btn.className = "sl-selection-action-btn"
		dialectV1Btn.textContent = DialectV1_Label
		dialectV1Btn.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selection = this.getSelectionActionContext()
			if (selection == undefined) { return }
			this.hideSelectionActionPopup()
			await this.runDialectInView(selection.view, selection.text, EngineDialectV1)
		})

		const dialectV2Btn = document.createElement("button")
		dialectV2Btn.type = "button"
		dialectV2Btn.className = "sl-selection-action-btn"
		dialectV2Btn.textContent = DialectV2_Label
		dialectV2Btn.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			const selection = this.getSelectionActionContext()
			if (selection == undefined) { return }
			this.hideSelectionActionPopup()
			await this.runDialectInView(selection.view, selection.text, EngineDialectV2)
		})

		popup.appendChild(editBtn)
		popup.appendChild(interpretBtn)
		popup.appendChild(dialectV1Btn)
		popup.appendChild(dialectV2Btn)
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

	private getFullEditorText(view: MarkdownView): string {
		const editor = view.editor
		return editor.getRange({ line: 0, ch: 0 }, { line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length })
	}

	private async startSLInterpreterRequest(selection: string, contextText: string, interpreteText: string, useNlp: boolean, trackSelection?: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } }): Promise<void> {
		if (!this.pluginEnabled || selection.length == 0) { return }
		if (this.interpreterBusy) {
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined, "SL-Interpreter: request already running, ignoring re-trigger")
			new Notice("SL-Interpreter is already running …")
			return
		}
		this.interpreterBusy = true
		// Progress overlay fed by the server's /rules/progress snapshots (same
		// mechanism as the DialectEngine); needs the SemaLogic view, so it can only
		// start once the view is available.
		let progressToken = 0
		try {
			if (!(await this.ensureSemaLogicViewForRequest())) { return }
			progressToken = this.slComm.slview.startServerProgress(this.settings, mygSID, "SL-Interpreter", "Running SL-Interpreter ...")

			const shouldTrackSelection = trackSelection != undefined
			if (this.interpreterInterval != undefined) {
				window.clearInterval(this.interpreterInterval)
				this.interpreterInterval = undefined
			}
			if (shouldTrackSelection) {
				this.pauseAllRequests = true
				this.updateOutstanding = false
				this.updateTransferOutstanding = false
				// Persist the interpretation as an HTML anchor only for genuine NLP interpretations;
				// pure technical SemaLogic (useNlp == false) is already SL and needs no persistence.
				this.interpreterSelection = { ...trackSelection, sourceText: selection, original: selection, persist: useNlp }
			} else {
				this.interpreterSelection = undefined
			}
			this.interpreterLastCanvas = ""
			// Canonical lowercase `nlp` (API 00.03.00); the server only reads the
			// old uppercase `NLP` when `nlp` is absent.
			const vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + mygSID + (useNlp ? "&nlp=true" : "");
			const response = await this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, "default", contextText, true, RulesettypesCommands[Rstypes_KnowledgeGraph][1], interpreteText)
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "SL-Interpreter LLM response", response)
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
		} finally {
			if (progressToken != 0) {
				this.slComm.slview.stopServerProgress(progressToken)
			}
			this.interpreterBusy = false
		}
	}

	private async startSLInterpreterFromText(selection: string, trackSelection?: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } }): Promise<void> {
		const contextText = trackSelection != undefined ? this.getFullEditorText(trackSelection.view) : selection
		await this.startSLInterpreterRequest(selection, contextText, selection, true, trackSelection)
	}

	private async startSLInterpreterFromSLText(selection: string, slText: string, trackSelection?: { view: MarkdownView; from: { line: number; ch: number }; to: { line: number; ch: number } }): Promise<void> {
		const contextText = trackSelection != undefined ? this.getFullEditorText(trackSelection.view) : selection
		await this.startSLInterpreterRequest(selection, contextText, slText, false, trackSelection)
	}

	// Triggered by the "Dialect_v1" / "Dialect_v2" selection-action buttons and
	// editor-menu items (mirroring SL-Interpret). Sends the same /rules/parse
	// request as SL-Interpret for the given selection (full note as context,
	// selection as interprete), but adds the OpenAPI `engine` query parameter
	// (dialectgen_v1/_v2). Unlike SL-Interpret the response is not integrated into
	// the editor/canvas; it is rendered in the SemaLogic view.
	public async runDialectInView(view: MarkdownView, selection: string, engineValue: string): Promise<void> {
		const interpreteText = selection?.trim() ?? ""
		console.log(`[SL-Dialect] runDialectInView engine=${engineValue} selectionLen=${interpreteText.length}`)
		if (view == undefined || interpreteText.length == 0) {
			console.log("[SL-Dialect] aborted: no markdown editor or empty selection")
			new Notice("SL-Dialect: bitte zuerst Text markieren.")
			return
		}
		if (!(await this.ensureSemaLogicViewForRequest())) {
			console.log("[SL-Dialect] aborted: SemaLogic view not available")
			return
		}
		const dialectSid = `${Date.now()}-${Math.round(Math.random() * 999999)}`
		const contextText = this.getFullEditorText(view)
		const vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + encodeURIComponent(dialectSid)
		// The server requires rulesettype=DialectEngine for dialectgen_v1/v2,
		// together with the explicit engine query parameter and an interprete block.
		const dialectFormat = RulesettypeDialectEngine
		// Reflect the dialect mode in the SemaLogic view dropdown.
		this.slComm.slview.setOutPutFormat(DialectGen_Label)
		const progressToken = this.slComm.slview.startServerProgress(this.settings, dialectSid, "Dialect", `Running ${engineValue} ...`)
		console.log(`[SL-Dialect] sending parse request url=${vAPI_URL}&engine=${engineValue} dialectID=default rulesettype=${dialectFormat} sid=${dialectSid} interpreteLen=${interpreteText.length} contextLen=${contextText.length}`)
		try {
			// parseOnTheFly = false -> the result is stored and rendered in the SemaLogic view.
			const response = await this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, "default", contextText, false, dialectFormat, interpreteText, engineValue)
			console.log(`[SL-Dialect] response received length=${response?.length ?? 0}`)
		} finally {
			this.slComm.slview.stopServerProgress(progressToken)
		}
	}

	private async processCanvasResponse(raw: string, canvasPath: string, allowFiles: boolean): Promise<void> {
		if (!raw || raw.length == 0) {
			await this.writeCanvasFile(canvasPath, "{ \"nodes\": [], \"edges\": [] }")
			return;
		}
		try {
			const parsed = JSON.parse(raw)
			if (parsed && Array.isArray(parsed.nodes) && (parsed.edges == undefined || Array.isArray(parsed.edges))) {
				if (allowFiles && Array.isArray(parsed.files)) {
					await this.createFilesFromResponse(parsed.files)
				}
				// Accept nodes without relations; normalise a missing/empty edges list to an empty array.
				const canvas = { nodes: parsed.nodes, edges: Array.isArray(parsed.edges) ? parsed.edges : [] }
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
		container.dataset.slTest = "canvas"
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
			el.dataset.slTestTooltipBound = "1"
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
		tooltip.dataset.slTest = "canvas-tooltip"
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
			// A canvas needs nodes; edges may be missing/empty (nodes without relations is a valid result).
			return Array.isArray(parsed?.nodes) && (parsed?.edges == undefined || Array.isArray(parsed?.edges))
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
		this.applyCanvasMenuResponsiveLayout(menu)

		const btn = document.createElement("button")
		btn.className = "clickable-icon sl-node-info-btn"
		btn.dataset.slTest = "canvas-info-button"
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

			const focused = this.getFocusedCanvasNode(leaf, container)
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
		if (this.hasFocusedCanvasEdge(leaf, container)) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-canvas-node-select")) { return }
		this.applyCanvasMenuResponsiveLayout(menu)
		const currentAnchorNodeId = this.getFocusedCanvasNodeId(leaf, container)
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
		nodeSelect.style.minWidth = "0"
		nodeSelect.style.flexShrink = "1"
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
		nodeSelect.value = ""
		this.bindCanvasMenuControlEvents(nodeSelect)
		nodeSelect.addEventListener("change", async () => {
			const selected = nodeSelect.value as CanvasNodeInsertType | ""
			if (!selected) { return }
			this.canvasNodeInsertSelections.set(canvasFile.path, selected)
			const anchorNodeId = this.getCanvasMenuAnchorNodeId(container) || currentAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas insert change: selected=${selected} anchor=${anchorNodeId ?? ""}`)
			if (!anchorNodeId) {
				new Notice("Select a node first.")
				nodeSelect.value = ""
				return
			}
			await this.insertCanvasNode(leaf, selected, anchorNodeId)
			nodeSelect.value = ""
		})

		menu.appendChild(nodeSelect)
	}

	private addCanvasChangeControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		if (!canvasFile) { return }
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		if (this.hasFocusedCanvasEdge(leaf, container)) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-canvas-node-change-select")) { return }
		this.applyCanvasMenuResponsiveLayout(menu)
		const currentAnchorNodeId = this.getFocusedCanvasNodeId(leaf, container)
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
		changeSelect.style.minWidth = "0"
		changeSelect.style.flexShrink = "1"
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
		changeSelect.value = ""
		this.bindCanvasMenuControlEvents(changeSelect)
		changeSelect.addEventListener("change", async () => {
			const selected = changeSelect.value as CanvasNodeInsertType | ""
			if (!selected) { return }
			const anchorNodeId = this.getCanvasMenuAnchorNodeId(container) || currentAnchorNodeId
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas change change [${SL_DEBUG_BUILD}]: selected=${selected} anchor=${anchorNodeId ?? ""}`)
			if (!anchorNodeId) {
				new Notice("Select a node first.")
				changeSelect.value = ""
				return
			}
			await this.changeCanvasNodeConcept(leaf, anchorNodeId, selected)
			changeSelect.value = ""
		})

		menu.appendChild(changeSelect)
	}

	private removeCanvasInsertControls(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		container.querySelector(".sl-canvas-node-select")?.remove()
		container.querySelector(".sl-canvas-node-change-select")?.remove()
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

	private applyCanvasMenuResponsiveLayout(menu: HTMLElement): void {
		menu.style.flexWrap = "wrap"
		menu.style.rowGap = "6px"
		menu.style.columnGap = "6px"
		menu.style.justifyContent = "flex-end"
		menu.style.alignItems = "center"
		menu.style.maxWidth = "calc(100vw - 24px)"
		menu.style.overflow = "visible"
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
			const target = evt.target
			trackTarget(target)
		})
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			const target = evt.target
			trackTarget(target)
		})
	}

	private updateCanvasMenuAnchorState(leaf: WorkspaceLeaf): void {
		const view: any = leaf.view
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!container) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu) { return }
		const anchorNodeId = this.getCanvasMenuDomAnchorNodeId(menu) || this.getFocusedCanvasNodeId(leaf, container) || container.dataset.slLastNodeId
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
		const leaf = this.findLeafForCanvasContainer(container)
		const focusedAnchor = leaf ? (this.getFocusedCanvasNodeId(leaf, container) || "") : ""
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

	private findLeafForCanvasContainer(container: HTMLElement): WorkspaceLeaf | undefined {
		let found: WorkspaceLeaf | undefined = undefined
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found != undefined) { return }
			const leafContainer: HTMLElement | undefined = (leaf.view as any)?.containerEl
			if (leafContainer === container) {
				found = leaf
			}
		})
		return found
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
		if (!this.hasFocusedCanvasEdge(leaf, container)) { return }
		const menu = container.querySelector<HTMLElement>(".canvas-menu")
		if (!menu || menu.querySelector(".sl-canvas-menu-edge-mode")) { return }
		this.applyCanvasMenuResponsiveLayout(menu)
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
		bar.style.display = (this.hasFocusedCanvasNode(leaf, container) || this.hasFocusedCanvasEdge(leaf, container)) ? "none" : "flex"
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
		const focused = this.getFocusedCanvasNode(leaf, container)
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

	private getCanvasSelectionEntries(leaf: WorkspaceLeaf): any[] {
		const canvas = (leaf.view as any)?.canvas
		const selection = canvas?.selection
		if (!selection) { return [] }
		try {
			return Array.from(selection as Iterable<any>)
		} catch (e) {
			return []
		}
	}

	private extractCanvasSelectionId(entry: any): string {
		return String(entry?.id ?? entry?.node?.id ?? entry?.data?.id ?? "")
	}

	private isCanvasSelectionEdge(entry: any): boolean {
		return Boolean(entry?.fromNode || entry?.toNode || entry?.data?.fromNode || entry?.data?.toNode)
	}

	private getFocusedCanvasNode(leaf: WorkspaceLeaf, container: HTMLElement): HTMLElement | null {
		const selectedId = this.getFocusedCanvasNodeId(leaf, container)
		if (selectedId) {
			const byNodeId = container.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`)
			if (byNodeId) { return byNodeId }
			const byDataId = container.querySelector<HTMLElement>(`[data-id="${selectedId}"]`)
			if (byDataId) { return byDataId }
		}
		return container.querySelector<HTMLElement>(
			".canvas-node.is-focused, .canvas-node.is-selected, .canvas-node.is-editing"
		)
	}

	private hasFocusedCanvasNode(leaf: WorkspaceLeaf, container: HTMLElement): boolean {
		return this.getFocusedCanvasNodeId(leaf, container) != undefined
	}

	private hasFocusedCanvasEdge(leaf: WorkspaceLeaf, container: HTMLElement): boolean {
		return this.getSelectedCanvasEdgeIds(leaf, container).length > 0
	}

	private async insertCanvasNode(leaf: WorkspaceLeaf, nodeType: CanvasNodeInsertType, anchorNodeId?: string): Promise<void> {
		const view: any = leaf.view
		const canvasFile: TFile | undefined = view?.file
		const container: HTMLElement | null = view?.containerEl ?? null
		if (!canvasFile || !container) { return }

		const data = await this.readCanvasFileData(canvasFile)
		const anchorId = anchorNodeId ?? this.getFocusedCanvasNodeId(leaf, container)
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
		const attributeValue = nodeType == "ATTRIBUTE" ? await this.promptCanvasAttributeValue("") : undefined
		if (nodeType == "ATTRIBUTE" && attributeValue == undefined) {
			new Notice("ATTRIBUTE insertion cancelled.")
			return
		}

		const nextNode = this.buildCanvasNode(nodeType, requestedId, anchorNode, { orConfig, value: attributeValue })
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

	private async promptCanvasAttributeValue(initialValue: string): Promise<string | undefined> {
		return await new Promise((resolve) => {
			const modal = new CanvasAttributeValueModal(this.app, initialValue, resolve)
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
		this.refreshCanvasEdgesForNode(data, node.id)

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

	private getFocusedCanvasNodeId(leaf: WorkspaceLeaf, container: HTMLElement): string | undefined {
		for (const entry of this.getCanvasSelectionEntries(leaf)) {
			if (this.isCanvasSelectionEdge(entry)) { continue }
			const id = this.extractCanvasSelectionId(entry)
			if (id.length > 0) {
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas selection node [${SL_DEBUG_BUILD}]: ${id}`)
				return id
			}
		}
		const focused = container.querySelector<HTMLElement>(
			".canvas-node.is-focused, .canvas-node.is-selected, .canvas-node.is-editing, [data-node-id], .canvas-node[data-id]"
		)
		return focused?.getAttribute("data-node-id")
			|| focused?.getAttribute("data-id")
			|| focused?.dataset.nodeId
			|| focused?.dataset.id
			|| undefined
	}

	private getSelectedCanvasNodeIds(leaf: WorkspaceLeaf, container: HTMLElement): string[] {
		const ids: string[] = []
		for (const entry of this.getCanvasSelectionEntries(leaf)) {
			if (this.isCanvasSelectionEdge(entry)) { continue }
			const id = this.extractCanvasSelectionId(entry)
			if (id && !ids.includes(id)) {
				ids.push(id)
			}
		}
		const focusedId = this.getFocusedCanvasNodeId(leaf, container)
		if (focusedId && !ids.includes(focusedId)) {
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

	private getSelectedCanvasEdgeIds(leaf: WorkspaceLeaf, container: HTMLElement): string[] {
		const ids: string[] = []
		for (const entry of this.getCanvasSelectionEntries(leaf)) {
			if (!this.isCanvasSelectionEdge(entry)) { continue }
			const id = this.extractCanvasSelectionId(entry)
			if (id && !ids.includes(id)) {
				slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview, `Canvas selection edge [${SL_DEBUG_BUILD}]: ${id}`)
				ids.push(id)
			}
		}
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

		const selectedEdgeIds = this.getSelectedCanvasEdgeIds(leaf, container)
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
		const targetConcept = this.getCanvasNodeConcept(targetNode)
		if (targetConcept == "LEAF") {
			return { fromSide: "right", toSide: "left" }
		}
		return { fromSide: "bottom", toSide: "top" }
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

	private refreshCanvasEdgesForNode(data: CanvasFileData, nodeId: string): void {
		const nodeMap = new Map(data.nodes.map((node) => [node.id, node] as const))
		for (const edge of data.edges) {
			if (edge.fromNode != nodeId && edge.toNode != nodeId) { continue }
			const sourceNode = nodeMap.get(edge.fromNode)
			const targetNode = nodeMap.get(edge.toNode)
			if (!sourceNode || !targetNode) { continue }
			const sides = this.getCanvasEdgeSides(sourceNode, targetNode)
			edge.fromSide = sides.fromSide
			edge.toSide = sides.toSide
		}
	}

	private getCanvasNodeConcept(node: CanvasFileNode): string {
		const text = String(node.text ?? "")
		const match = text.match(/^Concept:\s*(.+)$/im)
		return match?.[1]?.trim().toUpperCase() ?? ""
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

	private registerSemaLogicView(): void {
		if (this.semaLogicViewRegistered) { return }
		this.registerView(SemaLogicViewType, (leaf) => new SemaLogicView(leaf))
		this.semaLogicViewRegistered = true
	}

	private registerLawCatalogView(): void {
		if (this.lawCatalogViewRegistered) { return }
		this.registerView(LawCatalogViewType, (leaf) => new LawCatalogView(leaf))
		this.lawCatalogViewRegistered = true
	}

	private registerLawRawView(): void {
		if (this.lawRawViewRegistered) { return }
		this.registerView(LawRawViewType, (leaf) => new LawRawMarkdownView(leaf))
		this.lawRawViewRegistered = true
	}

	private getSemaLogicLeaves(): WorkspaceLeaf[] {
		const leaves: WorkspaceLeaf[] = []
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view.getViewType() == SemaLogicViewType) {
				leaves.push(leaf)
			}
		})
		return leaves
	}

	private removeDuplicateSemaLogicLeaves(): void {
		const leaves = this.getSemaLogicLeaves()
		if (leaves.length < 2) { return }
		const activeLeaf = this.app.workspace.activeLeaf
		const retainedLeaf = activeLeaf != null && leaves.includes(activeLeaf) ? activeLeaf : leaves[0]
		leaves.forEach((leaf) => {
			if (leaf != retainedLeaf) { leaf.detach() }
		})
		slconsolelog(DebugLevMap.DebugLevel_Informative, undefined,
			`Removed ${leaves.length - 1} duplicate SemaLogic workspace leaf/leaves during startup`)
	}

	// Restored law leaves are exactly the ones Obsidian defers, so this collects
	// them by view type first and then loads each one before touching it. The
	// previous version called setComm on the placeholder, which threw inside the
	// iteration and left the whole startup initialisation unfinished.
	private initializeRestoredLawCatalogViews(): void {
		const candidates: WorkspaceLeaf[] = []
		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewType = leaf.view.getViewType()
			if (viewType == LawRawViewType || viewType == LawCatalogViewType) {
				candidates.push(leaf)
			}
		})
		candidates.forEach((leaf) => { void this.initializeRestoredLawLeaf(leaf) })
	}

	private async initializeRestoredLawLeaf(leaf: WorkspaceLeaf): Promise<void> {
		try {
			if (SemaLogicPlugin.isDeferredLeaf(leaf)) {
				await this.loadDeferredLeaf(leaf)
			}
			const view = leaf.view
			if (view instanceof LawRawMarkdownView) {
				view.setComm(this.slComm)
				const rawState = view.getRawRestoreState()
				if (rawState != undefined) {
					await this.restoreLawRawView(view, rawState)
				}
				return
			}
			if (view instanceof LawCatalogView) {
				view.setComm(this.slComm)
				const restoreState = view.getCatalogRestoreState()
				if (restoreState != undefined) {
					await this.restoreLawCatalogView(view, restoreState)
				}
				return
			}
			slconsolelog(DebugLevMap.DebugLevel_Informative, undefined,
				`Law leaf ${leaf.view.getViewType()} stayed deferred and was left untouched`)
		} catch (e) {
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined,
				`Restoring a law leaf failed: ${e instanceof Error ? e.message : String(e)}`)
		}
	}

	private async restoreLawRawView(view: LawRawMarkdownView,
		state: { lawTitle: string; downloadUrl: string; lawId: string; lawVersion: string; lawAbbreviation: string; fileName: string }): Promise<void> {
		let responseStatus: number | undefined
		try {
			const response = await requestUrl(this.createLawApiRequest(state.downloadUrl))
			responseStatus = response.status
			if (response.status < 200 || response.status >= 300) {
				throw new Error(`HTTP ${response.status}`)
			}
			view.showRawMarkdown(response.text ?? "", state.downloadUrl, {
				lawId: state.lawId,
				version: state.lawVersion,
				abbreviation: state.lawAbbreviation,
				fileName: state.fileName || this.lawRawFileName(response.headers, state.downloadUrl, state.lawId)
			})
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
				`Restored law raw markdown view (url=${state.downloadUrl})`)
		} catch (e) {
			view.showRestoreError(`UseSemaLogic: ${state.lawTitle} konnte nicht neu geladen werden. ${e instanceof Error ? e.message : String(e)}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Law raw markdown restore failed (url=${state.downloadUrl}, status=${responseStatus ?? "transport error"}): ${e instanceof Error ? e.message : String(e)}`)
		}
	}

	private async restoreLawCatalogView(view: LawCatalogView,
		state: { lawTitle: string; catalogUrl: string; targetId: string; lawId: string; lawVersion: string; lawAbbreviation: string }): Promise<void> {
		let responseStatus: number | undefined
		try {
			const response = await requestUrl(this.createExternalLawRequest(state.catalogUrl))
			responseStatus = response.status
			if (response.status < 200 || response.status >= 300) {
				throw new Error(`HTTP ${response.status}`)
			}
			view.showLawDocument(state.lawTitle, state.catalogUrl, response.text ?? "", state.targetId, {
				lawId: lawHeaderValue(response.headers, "X-SL-Law-Id") || state.lawId,
				version: lawHeaderValue(response.headers, "X-SL-Version") || state.lawVersion,
				abbreviation: state.lawAbbreviation
			}, lawHeaderValue(response.headers, "X-SL-Raw-Download"))
			slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
				`Restored law catalog view (url=${state.catalogUrl}, target=${state.targetId})`)
		} catch (e) {
			view.showRestoreError(`UseSemaLogic: ${state.lawTitle} could not be reloaded. ${e instanceof Error ? e.message : String(e)}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				`Catalog law view restore failed (url=${state.catalogUrl}, status=${responseStatus ?? "transport error"}): ${e instanceof Error ? e.message : String(e)}`)
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
				{ url: state.catalogUrl, method: "GET", responseStatus })
		}
	}

	async activateView(resetService: boolean = true, update: boolean = true) {
		this.registerSemaLogicView()

		// Reuse a restored leaf as-is. Replacing it with setViewState during
		// startup can leave a stale leaf behind in the persisted workspace.
		const leaf = this.GetSemaLogicLeaf() ?? this.app.workspace.getLeaf('split');
		if (leaf != undefined) {
			if (leaf.view.getViewType() != SemaLogicViewType) {
				await leaf.setViewState({
					type: SemaLogicViewType,
					active: false,
				})
			}
			if (resetService) {
				await this.semaLogicReset()
			}
			this.app.workspace.revealLeaf(leaf);
		} else {
			slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "SemaLogic-Leaf not created")
		}
		this.setViews()
		this.handlePing()
		if (update && this.slComm.slview != undefined) {
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
			// The editor was edited manually in the tracked range. Don't clobber that edit and
			// don't freeze the session: adopt the current editor text as the new baseline and
			// keep the SemaLogic view live, then resume on the next canvas change.
			slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm.slview, "KnowledgeEdit: editor changed manually, re-sync baseline")
			const fromOffset = editor.posToOffset(sel.from)
			sel.to = editor.offsetToPos(fromOffset + current.length)
			sel.original = current
			this.pauseAllRequests = false
			this.semaLogicUpdate()
			this.pauseAllRequests = true
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

		try {
			const vAPI_URL = getHostPort(this.settings) + API_Defaults.rules_parse + "?sid=" + mygSID;
			const response = await this.slComm.slview.getSemaLogicParse(this.settings, vAPI_URL, "default", normalizedSelection, true, RulesettypesCommands[Rstypes_KnowledgeGraph][1])
			await this.processCanvasResponse(response, this.knowledgeEditCanvasPath, false)
			await this.openKnowledgeEditCanvas()

			if (this.knowledgeEditInterval != undefined) {
				window.clearInterval(this.knowledgeEditInterval)
				this.knowledgeEditInterval = undefined
			}
		} catch (e) {
			// A failed request must not leave the global lock stuck: release it so normal
			// text -> canvas updates keep working. On success the lock stays set on purpose
			// for the running SL-Edit session (reset later in stopKnowledgeEdit).
			slconsolelog(DebugLevMap.DebugLevel_Error, undefined, "KnowledgeEdit (SL-Edit) request failed", e)
			new Notice("SL-Edit failed – live updates re-enabled. See console for details.")
			this.knowledgeEditSelection = undefined
			this.knowledgeEditLastCanvas = ""
			this.pauseAllRequests = false
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
		// Only hold the interpretation for next time when it is not pure technical SemaLogic.
		if (!this.interpreterSelection.persist) { return }
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
		if (this.automaticParseRetry != undefined) {
			window.clearTimeout(this.automaticParseRetry)
			this.automaticParseRetry = undefined
		}
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
		this.sectionStyleEl?.remove()
		this.sectionStyleEl = undefined
		// commented out due to publishing process - see PlugInGuideline - could be deleted
		this.app.workspace.detachLeavesOfType(SemaLogicViewType);
		this.app.workspace.detachLeavesOfType(ASPViewType);
		this.app.workspace.detachLeavesOfType(LawCatalogViewType);
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
		// Older data.json files predate the statute picker.
		if (!Array.isArray(this.settings.lawRecents)) {
			this.settings.lawRecents = [];
		}
		this.ensureSectionStyleSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// The server profile may have changed with these settings: another
		// installation has another catalog, other ETags and possibly no
		// /law/index at all.
		this.resetLawCaches();
		if (this.slComm.slview != undefined) { this.slComm.slview.setNewInitial(this.settings.mySLSettings[this.settings.mySetting].myOutputFormat, false) }
		this.updateOutstanding = true;
		//this.semaLogicParse();
	}

	// Backfill / repair the section-style settings so older data.json files and
	// partially written slots always expose the full structure.
	ensureSectionStyleSettings() {
		if (typeof this.settings.sectionStyleEnabled != "boolean") {
			this.settings.sectionStyleEnabled = Default_profile.sectionStyleEnabled
		}
		if (!Array.isArray(this.settings.sectionStyleSlots) || this.settings.sectionStyleSlots.length == 0) {
			this.settings.sectionStyleSlots = Default_profile.sectionStyleSlots.map((slot, i) => defaultSectionStyleSlot(slot.name || `Style-Set ${i + 1}`))
		}
		// Guarantee at least 3 slots and a complete style record per slot.
		while (this.settings.sectionStyleSlots.length < 3) {
			this.settings.sectionStyleSlots.push(defaultSectionStyleSlot(`Style-Set ${this.settings.sectionStyleSlots.length + 1}`))
		}
		this.settings.sectionStyleSlots.forEach((slot, i) => {
			if (typeof slot.name != "string" || slot.name.length == 0) { slot.name = `Style-Set ${i + 1}` }
			if (typeof slot.levelIndent != "string") { slot.levelIndent = SL_DEFAULT_LEVEL_INDENT }
			// Migrate the legacy fixed Record<class, style> to the editable list, if present.
			const legacy = (slot as unknown as { styles?: Record<string, SLSectionStyle> }).styles
			if (!Array.isArray(slot.classStyles)) {
				if (legacy != undefined && typeof legacy == "object") {
					slot.classStyles = SL_SECTION_CLASSES
						.filter((cls) => legacy[cls] != undefined)
						.map((cls) => Object.assign(makeSectionClassStyle(cls), legacy[cls]))
					if (slot.classStyles.length == 0) { slot.classStyles = defaultSectionClassStyles() }
				} else {
					slot.classStyles = defaultSectionClassStyles()
				}
			}
			delete (slot as unknown as { styles?: unknown }).styles
			// Drop invalid entries and backfill any missing style fields per class.
			slot.classStyles = slot.classStyles.filter((cs) => cs != undefined && typeof cs.className == "string")
			slot.classStyles.forEach((cs, idx) => {
				const builtInDefault = defaultSectionClassStyles().find(defaultStyle => defaultStyle.className == cs.className)
				slot.classStyles[idx] = Object.assign(builtInDefault ?? makeSectionClassStyle(cs.className), cs)
			})
			if (slot.annotations == undefined) { slot.annotations = defaultAnnotationStyles() }
			const annotationDefaults = defaultAnnotationStyles()
			SL_ANNOTATION_KEYS.forEach((key) => {
				slot.annotations[key] = Object.assign(annotationDefaults[key], slot.annotations[key])
			})
			slot.target = Object.assign(defaultTargetStyle(), slot.target)
		})
		if (typeof this.settings.sectionStyleSlot != "number"
			|| this.settings.sectionStyleSlot < 0
			|| this.settings.sectionStyleSlot >= this.settings.sectionStyleSlots.length) {
			this.settings.sectionStyleSlot = 0
		}
	}

	// Strip characters that could break out of a CSS declaration. Users only style
	// their own vault, but keeping the injected stylesheet well-formed avoids surprises.
	private sanitizeCssValue(value: string): string {
		return (value ?? "").replace(/[{}<>;]/g, "").replace(/[\r\n]+/g, " ").trim()
	}

	// A class token used inside [class~="…"] must not contain whitespace or the
	// characters that would break out of the attribute selector.
	private sanitizeCssClassToken(value: string): string {
		return (value ?? "").replace(/["'\\\]\s]/g, "").trim()
	}

	// Turn a style entry into CSS declarations, skipping unset (empty) values.
	private sectionStyleDeclarations(s: SLSectionStyle): string[] {
		const decls: string[] = []
		const color = this.sanitizeCssValue(s.color)
		const fontFamily = this.sanitizeCssValue(s.fontFamily)
		const fontSize = this.sanitizeCssValue(s.fontSize)
		const lineHeight = this.sanitizeCssValue(s.lineHeight)
		const fontWeight = this.sanitizeCssValue(s.fontWeight)
		const tdc = this.sanitizeCssValue(s.textDecorationColor)
		const tdl = this.sanitizeCssValue(s.textDecorationLine)
		const tds = this.sanitizeCssValue(s.textDecorationStyle)
		const indent = this.sanitizeCssValue(s.indent)
		if (color.length > 0) { decls.push(`color:${color}`) }
		if (fontFamily.length > 0) { decls.push(`font-family:${fontFamily}`) }
		if (fontSize.length > 0) { decls.push(`font-size:${fontSize}`) }
		if (lineHeight.length > 0) { decls.push(`line-height:${lineHeight}`) }
		if (fontWeight.length > 0) { decls.push(`font-weight:${fontWeight}`) }
		if (tdc.length > 0) { decls.push(`text-decoration-color:${tdc}`) }
		if (tdl.length > 0) { decls.push(`text-decoration-line:${tdl}`) }
		if (tds.length > 0) { decls.push(`text-decoration-style:${tds}`) }
		if (indent.length > 0) { decls.push(`margin-left:${indent}`) }
		return decls
	}

	// Selector bodies (without scope prefix) for the inline interpreter/reference
	// annotations. The interpreter case also covers the href-qualified variant so
	// the injected rule reliably overrides the equally-specific styles.css rules.
	private annotationSelectorBodies(key: SLAnnotationKey): string[] {
		switch (key) {
			case "interpreter": return [`a[data-sl-interpreter="1"]`, `a[href="#sl-interpreter"][data-sl-interpreter="1"]`]
			case "ref": return [`span[data-sl-ref]`]
		}
	}

	private buildSectionStyleCss(): string {
		// Apply in both the reading view (.markdown-rendered) and the editing view /
		// Live Preview (.markdown-source-view), where embedded HTML is also rendered.
		const scopes = [".markdown-rendered", ".markdown-source-view"]
		const lines: string[] = []
		// Emit one rule that combines every scope prefix with every selector body.
		const emit = (bodies: string[], decls: string[]) => {
			if (decls.length == 0) { return }
			const selector = bodies.flatMap(body => scopes.map(scope => `${scope} ${body}`)).join(",")
			lines.push(`${selector}{${decls.join(";")};}`)
		}

		const slot = this.settings.sectionStyleSlots[this.settings.sectionStyleSlot]

		// An optional level-based indent remains available for non-law style-sets.
		// The law-inspired default is zero because enumeration classes own their
		// alignment and their margins must not compound at every nesting level.
		const levelIndent = this.sanitizeCssValue(slot?.levelIndent ?? SL_DEFAULT_LEVEL_INDENT)
		emit([`section[data-sl-level]`], [`display:block`, `margin-left:${levelIndent.length > 0 ? levelIndent : "0"}`])
		emit([`section[data-sl-level="1"]`], [`margin-left:0`])
		// Give every SemaLogic section an explicit default color. An explicitly set
		// color wins over an inherited one, so a parent section's color no longer
		// leaks into its nested child sections (each per-class rule below still wins
		// on its own element via higher specificity).
		emit([`section[data-sl-id]`], [`color:var(--text-normal)`])

		if (slot != undefined) {
			const target = slot.target ?? defaultTargetStyle()
			const targetDecls: string[] = []
			const targetBackground = this.sanitizeCssValue(target.background)
			const targetBorderRadius = this.sanitizeCssValue(target.borderRadius)
			const targetBoxShadow = this.sanitizeCssValue(target.boxShadow)
			const targetScrollMarginTop = this.sanitizeCssValue(target.scrollMarginTop)
			if (targetBackground.length > 0) { targetDecls.push(`background:${targetBackground}`) }
			if (targetBorderRadius.length > 0) { targetDecls.push(`border-radius:${targetBorderRadius}`) }
			if (targetBoxShadow.length > 0) { targetDecls.push(`box-shadow:${targetBoxShadow}`) }
			if (targetScrollMarginTop.length > 0) { targetDecls.push(`scroll-margin-top:${targetScrollMarginTop}`) }
			emit([`:target`], targetDecls)

			slot.classStyles.forEach((s) => {
				// A class~="name" attribute selector handles arbitrary class names
				// without CSS-identifier escaping. Skip tokens that can't be a class name.
				const cls = this.sanitizeCssClassToken(s.className)
				if (cls.length == 0) { return }
				const elementDecls = this.sectionStyleDeclarations(s)
				const marginTop = this.sanitizeCssValue(s.marginTop)
				const marginBottom = this.sanitizeCssValue(s.marginBottom)
				const paddingTop = this.sanitizeCssValue(s.paddingTop)
				const paddingBottom = this.sanitizeCssValue(s.paddingBottom)
				const borderTop = this.sanitizeCssValue(s.borderTop)
				if (marginTop.length > 0) { elementDecls.push(`margin-top:${marginTop}`) }
				if (marginBottom.length > 0) { elementDecls.push(`margin-bottom:${marginBottom}`) }
				if (paddingTop.length > 0) { elementDecls.push(`padding-top:${paddingTop}`) }
				if (paddingBottom.length > 0) { elementDecls.push(`padding-bottom:${paddingBottom}`) }
				if (borderTop.length > 0) { elementDecls.push(`border-top:${borderTop}`) }

				// Class settings intentionally match every occurrence of the selected
				// class. Some structural wrappers (e.g. enumeration) do not have an id.
				emit([`[class~="${cls}"]`], elementDecls)

				// text-decoration propagates into descendant content in Chromium and
				// cannot be removed by children, so apply it only to the section's own
				// heading (headings never contain nested sections). This keeps the
				// decoration on the level's own label without cascading to sub-levels.
				const decorationDecls: string[] = []
				const headingColor = this.sanitizeCssValue(s.headingColor)
				const headingFontSize = this.sanitizeCssValue(s.headingFontSize)
				const headingFontWeight = this.sanitizeCssValue(s.headingFontWeight)
				const headingMarginBottom = this.sanitizeCssValue(s.headingMarginBottom)
				const headingPaddingBottom = this.sanitizeCssValue(s.headingPaddingBottom)
				const headingBorderBottom = this.sanitizeCssValue(s.headingBorderBottom)
				const tdc = this.sanitizeCssValue(s.textDecorationColor)
				const tdl = this.sanitizeCssValue(s.textDecorationLine)
				const tds = this.sanitizeCssValue(s.textDecorationStyle)
				if (headingColor.length > 0) { decorationDecls.push(`color:${headingColor}`) }
				if (headingFontSize.length > 0) { decorationDecls.push(`font-size:${headingFontSize}`) }
				if (headingFontWeight.length > 0) { decorationDecls.push(`font-weight:${headingFontWeight}`) }
				if (headingMarginBottom.length > 0) { decorationDecls.push(`margin-bottom:${headingMarginBottom}`) }
				if (headingPaddingBottom.length > 0) { decorationDecls.push(`padding-bottom:${headingPaddingBottom}`) }
				if (headingBorderBottom.length > 0) { decorationDecls.push(`border-bottom:${headingBorderBottom}`) }
				if (tdc.length > 0) { decorationDecls.push(`text-decoration-color:${tdc}`) }
				if (tdl.length > 0) { decorationDecls.push(`text-decoration-line:${tdl}`) }
				if (tds.length > 0) { decorationDecls.push(`text-decoration-style:${tds}`) }
				emit([`[class~="${cls}"] > :is(h1,h2,h3,h4,h5,h6)`], decorationDecls)
			})
			// Inline interpreter (a[data-sl-interpreter]) and reference (span[data-sl-ref]) annotations
			SL_ANNOTATION_KEYS.forEach((key) => {
				const s = slot.annotations?.[key]
				if (s == undefined) { return }
				emit(this.annotationSelectorBodies(key), this.sectionStyleDeclarations(s))
			})
		}
		return lines.join("\n")
	}

	// (Re)build and inject the section-style stylesheet, or remove it when disabled.
	applySectionStyles(): void {
		const id = "sl-section-style-tag"
		let el = document.getElementById(id) as HTMLStyleElement | null
		if (!this.settings.sectionStyleEnabled) {
			if (el != null) { el.remove() }
			this.sectionStyleEl = undefined
			return
		}
		if (el == null) {
			el = document.createElement("style")
			el.id = id
			document.head.appendChild(el)
		}
		this.sectionStyleEl = el
		el.textContent = this.buildSectionStyleCss()
	}

	handlePing() {
		semaLogicPing(this.settings, this.lastUpdate)
	}

	handleUpdate = (update: ViewUpdate) => {
		if (this.pauseAllRequests) {
			// During an active SL-Edit session the global pause blocks the normal render path.
			// Keep the parallel SemaLogic view live for edits made directly in the editor by
			// rendering in a short unpause window (same pattern as the KnowledgeEdit tick).
			if (this.knowledgeEditSelection != undefined && update != null && update.docChanged && this.statusSL) {
				if (this.parseDebounce != undefined) {
					window.clearTimeout(this.parseDebounce)
				}
				this.parseDebounce = window.setTimeout(() => {
					const wasPaused = this.pauseAllRequests
					this.pauseAllRequests = false
					this.semaLogicUpdate()
					if (wasPaused) { this.pauseAllRequests = true }
				}, 400)
			}
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

	semaLogicUpdate(setView?: boolean, showEditorProgress: boolean = false) {

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
		this.semaLogicParse(showEditorProgress);

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
			slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm.slview, e instanceof Error ? e.toString() : String(e))
		}
	}

}
