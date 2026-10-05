import { lawDocumentRouteFor, lawIndexRouteFor, lawMarkdownRouteFor, parseLawBackendCapabilities } from "./law_backend"

describe("Law backend migration", () => {
  test("uses legacy for an API reply from before 00.03.02", () => {
    expect(parseLawBackendCapabilities('{"version":"00.03.01"}')).toEqual({ backends: ["legacy"], defaultBackend: "legacy" })
  })

  test("reads the advertised backend set and default", () => {
    expect(parseLawBackendCapabilities('{"lawBackends":["legacy","new"],"lawBackendDefault":"new"}'))
      .toEqual({ backends: ["legacy", "new"], defaultBackend: "new" })
  })

  test("uses Law_New route shapes without legacy snapshot or raw paths", () => {
    expect(lawIndexRouteFor("new")).toBe("/lawnew/index")
    expect(lawDocumentRouteFor("new", "DE.GESETZ.BAFOEG")).toBe("/lawnew/doc/DE.GESETZ.BAFOEG")
    expect(lawMarkdownRouteFor("new", "DE.GESETZ.BAFOEG")).toBe("/lawnew/doc/DE.GESETZ.BAFOEG.md")
  })
})
