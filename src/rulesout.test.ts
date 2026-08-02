import {
	countFindings, detectTextFormat, diagnosticMessage, extractRulesout, looksLikeMarkdown,
	markdownSource, normalizeDiagnostics, parseRulesout, scopeCss, sortDiagnostics,
	splitHtmlDocument, withAudience
} from "./rulesout";

// Every payload below is one of the shapes captured from a running 00.03.00-01
// service in docs/FRONTEND_MIGRATION_00_03_00.md.
function decode(body: string) {
	const rulesout = parseRulesout(body)
	return { rulesout, payload: extractRulesout(rulesout, body), diagnostics: normalizeDiagnostics(rulesout?.diagnostics) }
}

const cleanDiagnostics = '"diagnostics":{"items":[],"summary":{"defect":0,"suspect":0,"note":0,"blocking":0,"hidden":0}}'

describe("rulesout payload extraction", () => {
	test("SemaLogic delivers an insertable fragment", () => {
		const { payload } = decode(`{"rulesettype":"SemaLogic","rules":{"html":"<font style=\\"color:#f8f8f8;\\">A</font>","fragment":true,"mediaType":"text/html","dialectID":"default"},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("html")
		expect(payload.fragment).toBe(true)
		expect(payload.content).toBe('<font style="color:#f8f8f8;">A</font>')
	})

	test("SemanticTree delivers a full document, not a fragment", () => {
		const { payload } = decode(`{"rulesettype":"SemanticTree","rules":{"html":"\\n<!DOCTYPE html>\\n<html lang=\\"en\\"></html>","fragment":false,"mediaType":"text/html","dialectID":"default"},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("html")
		expect(payload.fragment).toBe(false)
	})

	test("a missing fragment flag defaults to fragment", () => {
		const { payload } = decode(`{"rulesettype":"SemaLogic","rules":{"html":"<p>A</p>"},${cleanDiagnostics}}`)
		expect(payload.fragment).toBe(true)
	})

	test("SVG keeps the document including its prolog", () => {
		const { payload } = decode(`{"rulesettype":"SVG","rules":{"svg":"<?xml version=\\"1.0\\"?>\\n<svg></svg>","mediaType":"image/svg+xml"},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("svg")
		expect(payload.content.startsWith("<?xml")).toBe(true)
	})

	test("KnowledgeGraph canvas stays a JSON string the caller parses", () => {
		const { payload } = decode(`{"rulesettype":"KnowledgeGraph","rules":{"canvas":"{\\"nodes\\":[],\\"edges\\":[]}","view":"user"},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("canvas")
		expect(JSON.parse(payload.content)).toEqual({ nodes: [], edges: [] })
	})

	test("ASP.json exposes the unchanged rules array", () => {
		const { payload } = decode(`{"rulesettype":"ASP.json","rules":[{"term":[]}],${cleanDiagnostics}}`)
		expect(payload.kind).toBe("asp")
		expect(JSON.parse(payload.content)).toEqual([{ term: [] }])
	})

	test("DialectEngine exposes the engine output", () => {
		const { payload } = decode(`{"rulesettype":"DialectEngine","rules":{"engine":"dialectgen_v1","contentType":"text/html","output":"<p>x</p>"},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("engine")
		expect(payload.content).toBe("<p>x</p>")
	})

	test("AnnotatedHTML reports source so the echo stub is distinguishable", () => {
		const { payload } = decode(`{"rulesettype":"AnnotatedHTML","rules":{"html":"<div class=\\"sl-annotated\\"></div>","fragment":true,"mediaType":"text/html","source":"echo","textID":"t1"},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("html")
		expect(payload.source).toBe("echo")
	})

	test("AnnotatedHTML markup is rendered as markup", () => {
		const { payload } = decode(`{"rulesettype":"AnnotatedHTML","rules":{"html":"<section><p>Ein <span class=\\"sl-term\\">Begriff</span> im Satz.</p></section>","fragment":true,"mediaType":"text/html","source":"annotate"},${cleanDiagnostics}}`)
		expect(payload.format).toBe("html")
	})

	test("AnnotatedHTML markdown is detected despite the text/html default", () => {
		const { payload } = decode(`{"rulesettype":"AnnotatedHTML","rules":{"html":"# Titel\\n\\n- erster Punkt\\n- zweiter Punkt\\n\\nSiehe [[Andere Notiz]].","fragment":true,"mediaType":"text/html","source":"echo"},${cleanDiagnostics}}`)
		expect(payload.format).toBe("markdown")
	})

	test("a declared markdown media type settles it without looking at the content", () => {
		const { payload } = decode(`{"rulesettype":"AnnotatedHTML","rules":{"html":"Nur ein Satz ohne Marker.","fragment":true,"mediaType":"text/markdown; charset=utf-8"},${cleanDiagnostics}}`)
		expect(payload.format).toBe("markdown")
	})

	test("DialectEngine follows the content type it declares", () => {
		const { payload } = decode(`{"rulesettype":"DialectEngine","rules":{"engine":"dialectgen_v2","contentType":"text/markdown","output":"**fett**"},${cleanDiagnostics}}`)
		expect(payload.format).toBe("markdown")
		expect(payload.mediaType).toBe("text/markdown")
	})

	test("a body that is not an envelope is passed through unchanged", () => {
		// A pre-00.03.00 Canvas document also starts with "{".
		const raw = '{"nodes":[],"edges":[]}'
		const { rulesout, payload } = decode(raw)
		expect(rulesout).toBeUndefined()
		expect(payload.kind).toBe("raw")
		expect(payload.content).toBe(raw)
	})
})

describe("rulesout error path", () => {
	const body = '{"diagnostics":{"items":[{"audience":"user","severity":"defect","message":"engine \\"dialectgen_v1\\" requires rulesettype \\"DialectEngine\\""}],"summary":{"defect":1,"suspect":0,"note":0,"blocking":0,"hidden":0}},"rules":null}'

	test("the same decoder reads a 422 with rules null and no rulesettype", () => {
		const { rulesout, payload, diagnostics } = decode(body)
		expect(rulesout).toBeDefined()
		expect(rulesout?.rulesettype).toBeUndefined()
		expect(payload.kind).toBe("none")
		expect(diagnostics.items).toHaveLength(1)
		expect(diagnosticMessage(diagnostics.items[0])).toContain("dialectgen_v1")
	})

	test("an unknown rulesettype does not throw", () => {
		const { payload } = decode(`{"rulesettype":"SomethingNew","rules":{"a":1},${cleanDiagnostics}}`)
		expect(payload.kind).toBe("raw")
	})
})

describe("html vs. markdown detection", () => {
	test("a rendered SemaLogic fragment counts as markup", () => {
		expect(looksLikeMarkdown('<font style="color:#f8f8f8;">A</font> <b>B</b>')).toBe(false)
	})

	test("plain prose without any marker stays markup", () => {
		expect(looksLikeMarkdown("Ein Satz ohne jede Auszeichnung.")).toBe(false)
	})

	test("markdown with occasional inline HTML still counts as markdown", () => {
		const text = "# Titel\n\n- Punkt eins<br>\n- Punkt zwei\n\n**wichtig** und `code`"
		expect(looksLikeMarkdown(text)).toBe(true)
	})

	test("markdown wrapped in a document is unpacked and recognised", () => {
		const wrapped = '<!DOCTYPE html>\n<html><head><title>t</title></head><body><pre># Titel\n\n- a\n- b\n\n[Link](https://example.org) &amp; mehr</pre></body></html>'
		expect(markdownSource(wrapped, false)).toBe("# Titel\n\n- a\n- b\n\n[Link](https://example.org) & mehr")
		expect(detectTextFormat(wrapped, false)).toBe("markdown")
	})

	test("a real HTML document is not mistaken for wrapped markdown", () => {
		const document = '<!DOCTYPE html>\n<html><body><h1>Titel</h1><ul><li>a</li><li>b</li></ul></body></html>'
		expect(detectTextFormat(document, false)).toBe("html")
	})

	test("unwrapped markdown keeps its own entities", () => {
		expect(markdownSource("A &amp; B", true)).toBe("A &amp; B")
	})

	test("an empty payload is not markdown", () => {
		expect(looksLikeMarkdown("")).toBe(false)
		expect(detectTextFormat("", true)).toBe("html")
	})
})

describe("diagnostics", () => {
	test("a clean parse still yields a complete summary", () => {
		const { diagnostics } = decode(`{"rulesettype":"SemaLogic","rules":{"html":"","fragment":true},${cleanDiagnostics}}`)
		expect(countFindings(diagnostics.summary)).toBe(0)
		expect(diagnostics.summary.hidden).toBe(0)
	})

	test("missing diagnostics normalise to zeroed counters", () => {
		const diagnostics = normalizeDiagnostics(undefined)
		expect(diagnostics.items).toEqual([])
		expect(diagnostics.summary).toEqual({ defect: 0, suspect: 0, note: 0, blocking: 0, hidden: 0 })
	})

	test("summary counts the withheld findings via hidden", () => {
		const { diagnostics } = decode('{"rulesettype":"SemaLogic","rules":{"html":"x"},"diagnostics":{"items":[{"severity":"defect","audience":"user","message":"m"}],"summary":{"defect":1,"suspect":0,"note":2,"blocking":0,"hidden":2}}}')
		expect(diagnostics.items).toHaveLength(1)
		expect(countFindings(diagnostics.summary)).toBe(3)
		expect(diagnostics.summary.hidden).toBe(2)
	})

	test("findings sort by severity confidence", () => {
		const sorted = sortDiagnostics([
			{ severity: "note", message: "n" },
			{ severity: "blocking", message: "b" },
			{ severity: "suspect", message: "s" },
			{ severity: "defect", message: "d" }
		])
		expect(sorted.map(item => item.message)).toEqual(["b", "d", "s", "n"])
	})

	test("message wins over the deprecated errortext", () => {
		expect(diagnosticMessage({ message: "m", errortext: "e" })).toBe("m")
		expect(diagnosticMessage({ errortext: "e" })).toBe("e")
	})
})

describe("inlining a full document", () => {
	const doc = `\n<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
		`<title>Tree</title>\n<link rel="stylesheet" href="tree.css">\n` +
		`<style>body { margin: 2rem; }\nul.tree li { color: red; }</style>\n</head>\n` +
		`<body class="tree">\n<ul class="tree"><li>A</li></ul>\n<script>alert(1)</script>\n</body>\n</html>\n`

	test("keeps the body markup and drops the document wrapper", () => {
		const { body } = splitHtmlDocument(doc)
		expect(body).toBe('<ul class="tree"><li>A</li></ul>')
		expect(body).not.toContain("DOCTYPE")
		expect(body).not.toContain("<title>")
	})

	test("scripts, styles and links never reach the view", () => {
		const { body } = splitHtmlDocument(doc)
		expect(body).not.toContain("<script")
		expect(body).not.toContain("<style")
		expect(body).not.toContain("<link")
	})

	test("the document's own style blocks are collected", () => {
		const { css } = splitHtmlDocument(doc)
		expect(css).toContain("ul.tree li { color: red; }")
	})

	test("a document without <body> still yields its markup", () => {
		const { body } = splitHtmlDocument('<!DOCTYPE html>\n<html><head><title>t</title></head><p>A</p></html>')
		expect(body).toBe("<p>A</p>")
	})

	test("an empty document is no markup, not a crash", () => {
		expect(splitHtmlDocument("")).toEqual({ body: "", css: "" })
	})
})

describe("scoping the document CSS", () => {
	test("every selector is confined to the scope element", () => {
		expect(scopeCss("ul.tree li { color: red; }", ".sl-doc")).toBe(".sl-doc ul.tree li { color: red; }")
	})

	test("selector lists are scoped one by one", () => {
		expect(scopeCss("h1, h2 { margin: 0; }", ".sl-doc")).toBe(".sl-doc h1, .sl-doc h2 { margin: 0; }")
	})

	test("html, body and :root become the scope element itself", () => {
		expect(scopeCss("body { margin: 2rem; }", ".sl-doc")).toBe(".sl-doc { margin: 2rem; }")
		expect(scopeCss(":root { --x: 1px; }", ".sl-doc")).toBe(".sl-doc { --x: 1px; }")
		expect(scopeCss("body ul { margin: 0; }", ".sl-doc")).toBe(".sl-doc ul { margin: 0; }")
	})

	test("@media wraps scoped rules, @keyframes stays untouched", () => {
		const scoped = scopeCss("@media (min-width: 40em) { p { color: red; } }", ".sl-doc")
		expect(scoped).toContain(".sl-doc p { color: red; }")
		expect(scopeCss("@keyframes fade { from { opacity: 0; } }", ".sl-doc")).toContain("@keyframes fade")
	})

	test("comments are removed and empty CSS stays empty", () => {
		expect(scopeCss("/* c */ p { color: red; }", ".sl-doc")).toBe(".sl-doc p { color: red; }")
		expect(scopeCss("", ".sl-doc")).toBe("")
	})
})

describe("audience parameter", () => {
	test("user is the server default and is not sent", () => {
		expect(withAudience("http://h/rules/parse?sid=1", "user")).toBe("http://h/rules/parse?sid=1")
	})

	test("developer is appended to an existing query", () => {
		expect(withAudience("http://h/rules/parse?sid=1", "developer")).toBe("http://h/rules/parse?sid=1&audience=developer")
	})

	test("developer starts a query when there is none", () => {
		expect(withAudience("http://h/rules/parse", "developer")).toBe("http://h/rules/parse?audience=developer")
	})
})
