import {
	countFindings, diagnosticMessage, extractRulesout, normalizeDiagnostics,
	parseRulesout, sortDiagnostics, withAudience
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
