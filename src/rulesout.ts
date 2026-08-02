// Decoder for the response envelope introduced with SemaLogic Service API 00.03.00.
//
// Up to 00.02.x `/rules/parse` and `/rules/show` answered with the bare payload
// (HTML, SVG or a Canvas document). Since 00.03.00 every reply - success and
// error alike - is one JSON object:
//
//   { "rulesettype": "SemanticTree", "rules": { ... }, "diagnostics": { ... } }
//
// `rules` carries what used to be the response body, `diagnostics` is always
// present. See FRONTEND_MIGRATION_00_03_00.md for the full contract.

export type DiagnosticSeverity = "blocking" | "defect" | "suspect" | "note"
export type DiagnosticAudience = "user" | "developer"

export type Diagnostic = {
	// Always present.
	message?: string
	severity?: DiagnosticSeverity | string
	audience?: DiagnosticAudience | string
	// Optional enrichment: only a minority of engine producers emit structured
	// findings, so no required UI path may depend on these.
	code?: string
	id?: string
	subject?: { symbol?: string; path?: string[]; variant?: string; version?: string }
	reference?: string
	// Code location, only populated for audience=developer.
	origin?: { package?: string; file?: string; func?: string; line?: number }
	// Deprecated duplicate of `message`, kept only as a fallback for services
	// that do not fill `message` yet.
	errortext?: string
}

export type DiagnosticsSummary = {
	defect: number
	suspect: number
	note: number
	blocking: number
	// Findings withheld by the audience filter (see requestAudience_Developer).
	hidden: number
}

export type DiagnosticGroup = {
	code?: string
	count?: number
	ids?: string[]
}

export type Diagnostics = {
	items: Diagnostic[]
	summary: DiagnosticsSummary
	groups?: DiagnosticGroup[]
}

export type Rulesout = {
	// Absent when the request was rejected before an output format was chosen.
	rulesettype?: string
	// null on the error path.
	rules?: any
	diagnostics?: Diagnostics
}

// "raw" marks a body that is not a 00.03.00 envelope; it is passed through
// unchanged so an older service still renders.
export type RulesoutKind = "html" | "svg" | "canvas" | "asp" | "engine" | "raw" | "none"

export type RulesoutContent = {
	kind: RulesoutKind
	// Ready to use payload: markup, SVG, the Canvas JSON string or pretty
	// printed ASP facts.
	content: string
	// false means `content` is a complete <!DOCTYPE html> document; only its
	// body and style rules are rendered (see splitHtmlDocument).
	fragment: boolean
	// AnnotatedHTML only: "echo" while the annotator is not wired up yet,
	// "annotate" once it is.
	source?: string
}

// Values for the `audience` query parameter of /rules/parse, /rules/show and
// /rules/define. Anything else falls back to "user" on the server.
export const requestAudience_User = "user"
export const requestAudience_Developer = "developer"

const severityOrder: Record<string, number> = {
	blocking: 0,
	defect: 1,
	suspect: 2,
	note: 3
}

export function emptyDiagnostics(): Diagnostics {
	return { items: [], summary: { defect: 0, suspect: 0, note: 0, blocking: 0, hidden: 0 } }
}

// Tolerant envelope parse. Returns undefined for anything that is not a
// 00.03.00 rulesout object, so the caller can fall back to the raw body.
export function parseRulesout(body: string | undefined): Rulesout | undefined {
	const trimmed = body?.trim() ?? ""
	if (trimmed.length == 0 || trimmed.charAt(0) != "{") { return undefined }
	let parsed: any
	try {
		parsed = JSON.parse(trimmed)
	} catch (e) {
		return undefined
	}
	if (parsed == undefined || typeof parsed != "object" || Array.isArray(parsed)) { return undefined }
	// A pre-00.03.00 Canvas document also starts with "{" but carries neither key.
	if (!("rules" in parsed) && !("diagnostics" in parsed)) { return undefined }
	return parsed as Rulesout
}

export function normalizeDiagnostics(diagnostics: Diagnostics | undefined): Diagnostics {
	const empty = emptyDiagnostics()
	if (diagnostics == undefined) { return empty }
	return {
		items: Array.isArray(diagnostics.items) ? diagnostics.items : [],
		summary: { ...empty.summary, ...(diagnostics.summary ?? {}) },
		groups: Array.isArray(diagnostics.groups) ? diagnostics.groups : undefined
	}
}

// Total number of findings the server knows about, including the ones the
// audience filter withheld.
export function countFindings(summary: DiagnosticsSummary): number {
	return summary.blocking + summary.defect + summary.suspect + summary.note
}

export function diagnosticMessage(diagnostic: Diagnostic): string {
	const message = diagnostic.message?.trim() ?? ""
	if (message.length > 0) { return message }
	// `errortext` is deprecated; only used when a service leaves `message` empty.
	return diagnostic.errortext?.trim() ?? ""
}

export function severityRank(severity: string | undefined): number {
	const rank = severityOrder[severity ?? ""]
	return rank == undefined ? severityOrder.note : rank
}

export function sortDiagnostics(items: Diagnostic[]): Diagnostic[] {
	return [...items].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
}

// Picks the payload branch by the sibling `rulesettype`; there is no
// discriminator inside `rules` (the ASP branch is an array and cannot carry one).
export function extractRulesout(rulesout: Rulesout | undefined, rawBody: string): RulesoutContent {
	if (rulesout == undefined) {
		// Not an envelope - an older service answered with the bare payload.
		return { kind: "raw", content: rawBody ?? "", fragment: true }
	}
	const rules = rulesout.rules
	if (rules == undefined || rules == null) {
		return { kind: "none", content: "", fragment: true }
	}
	switch (rulesout.rulesettype) {
		case "SemaLogic":
		case "SemanticTree":
		case "AnnotatedHTML":
			return {
				kind: "html",
				content: String(rules.html ?? ""),
				// Only an explicit false means "complete document".
				fragment: rules.fragment !== false,
				source: rules.source
			}
		case "SVG":
			return { kind: "svg", content: String(rules.svg ?? ""), fragment: true }
		case "KnowledgeGraph":
			// `canvas` is a JSON *string*; the callers parse it themselves.
			return { kind: "canvas", content: String(rules.canvas ?? ""), fragment: true }
		case "ASP.json":
			return { kind: "asp", content: stringifyAsp(rules), fragment: true }
		case "DialectEngine":
			return { kind: "engine", content: String(rules.output ?? ""), fragment: true }
		default:
			// `rulesettype` may be absent (request rejected before an output
			// format was chosen) or unknown to this plugin version.
			return { kind: "raw", content: typeof rules == "string" ? rules : JSON.stringify(rules, undefined, 2), fragment: true }
	}
}

// A `fragment: false` payload is a complete document (SemanticTree). It is
// rendered inline like every other rulesettype, so the parts that cannot live
// inside the view - doctype, <html>, <head>, scripts - are dropped and only the
// body markup plus the document's own style rules are kept.
export type HtmlDocumentParts = {
	body: string
	css: string
}

export function splitHtmlDocument(documentHtml: string): HtmlDocumentParts {
	const source = documentHtml ?? ""
	const css = collectStyleBlocks(source)
	return { body: extractBody(source), css }
}

function collectStyleBlocks(source: string): string {
	const blocks: string[] = []
	const styleTag = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
	let match = styleTag.exec(source)
	while (match != null) {
		blocks.push(match[1].trim())
		match = styleTag.exec(source)
	}
	return blocks.filter(block => block.length > 0).join("\n")
}

function extractBody(source: string): string {
	const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(source)
	// No <body> at all: strip the document wrapper and keep whatever is left.
	const body = bodyMatch != undefined ? bodyMatch[1] : stripDocumentWrapper(source)
	return dropNonRenderable(body).trim()
}

function stripDocumentWrapper(source: string): string {
	return source
		.replace(/<!DOCTYPE[^>]*>/gi, "")
		.replace(/<\/?html\b[^>]*>/gi, "")
		.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
}

function dropNonRenderable(body: string): string {
	return body
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<link\b[^>]*>/gi, "")
}

// Confines the document's own rules to the element the body markup is rendered
// into, so a SemanticTree cannot restyle the surrounding Obsidian UI. Selectors
// addressing the document itself (html, body, :root) become the scope element.
export function scopeCss(css: string, scope: string): string {
	const source = stripCssComments(css ?? "")
	if (source.trim().length == 0) { return "" }
	return scopeRules(source, scope)
}

function stripCssComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

function scopeRules(css: string, scope: string): string {
	const out: string[] = []
	let index = 0
	while (index < css.length) {
		const braceAt = css.indexOf("{", index)
		if (braceAt < 0) { break }
		const prelude = css.substring(index, braceAt).trim()
		const blockEnd = matchingBrace(css, braceAt)
		const block = css.substring(braceAt + 1, blockEnd)
		if (prelude.startsWith("@")) {
			out.push(scopeAtRule(prelude, block, scope))
		} else if (prelude.length > 0) {
			out.push(`${scopeSelectors(prelude, scope)} {${block}}`)
		}
		index = blockEnd + 1
	}
	return out.join("\n")
}

// @media and @supports wrap ordinary rules, so their block is scoped in turn.
// @keyframes, @font-face and friends carry no selectors and are kept verbatim.
function scopeAtRule(prelude: string, block: string, scope: string): string {
	const name = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? ""
	if (name == "media" || name == "supports" || name == "layer" || name == "container") {
		return `${prelude} {\n${scopeRules(block, scope)}\n}`
	}
	return `${prelude} {${block}}`
}

function matchingBrace(css: string, openAt: number): number {
	let depth = 0
	for (let i = openAt; i < css.length; i++) {
		if (css.charAt(i) == "{") { depth++ }
		if (css.charAt(i) == "}") {
			depth--
			if (depth == 0) { return i }
		}
	}
	return css.length
}

function scopeSelectors(selectors: string, scope: string): string {
	return selectors
		.split(",")
		.map(selector => scopeSelector(selector.trim(), scope))
		.filter(selector => selector.length > 0)
		.join(", ")
}

function scopeSelector(selector: string, scope: string): string {
	if (selector.length == 0) { return "" }
	const documentSelector = /^(html|body|:root)\b/i
	if (documentSelector.test(selector)) {
		const rest = selector.replace(documentSelector, "").trim()
		return rest.length == 0 ? scope : `${scope} ${rest}`
	}
	return `${scope} ${selector}`
}

function stringifyAsp(rules: any): string {
	try {
		return JSON.stringify(rules, undefined, 2)
	} catch (e) {
		return String(rules)
	}
}

// Appends the `audience` query parameter. "user" is the server default and is
// left off so the URL stays the one users see in the logs.
export function withAudience(url: string, audience: string): string {
	if (audience == requestAudience_User || audience == "") { return url }
	return url + (url.includes("?") ? "&" : "?") + "audience=" + encodeURIComponent(audience)
}
