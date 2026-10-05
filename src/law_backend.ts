// API 00.03.02 law-pipeline selection.  Older servers omit these fields, in
// which case their established Law surface is the legacy backend.
export type LawBackend = "legacy" | "new"

export type LawBackendCapabilities = {
  backends: LawBackend[]
  defaultBackend: LawBackend
}

export function parseLawBackendCapabilities(body: string): LawBackendCapabilities {
  let value: any = {}
  try { value = JSON.parse(body) } catch (_) { /* pre-00.03.02 reply */ }
  const backends = Array.isArray(value?.lawBackends)
    ? value.lawBackends.filter((backend: unknown): backend is LawBackend => backend == "legacy" || backend == "new")
    : []
  const unique: LawBackend[] = [...new Set(backends as LawBackend[])]
  const defaultBackend = value?.lawBackendDefault == "new" || value?.lawBackendDefault == "legacy"
    ? value.lawBackendDefault as LawBackend
    : (unique[0] ?? "legacy")
  return { backends: unique.length > 0 ? unique : [defaultBackend], defaultBackend }
}

export function lawRoutePrefix(backend: LawBackend): string {
  return backend == "new" ? "/lawnew" : "/law"
}

export function lawIndexRouteFor(backend: LawBackend): string {
  return `${lawRoutePrefix(backend)}/index`
}

export function lawDocumentRouteFor(backend: LawBackend, lawId: string): string {
  const encoded = encodeURIComponent(lawId)
  // Law_New pages already include backlinks; unlike Law it has no snapshot view.
  return backend == "new" ? `/lawnew/doc/${encoded}` : `/law/doc/${encoded}?view=snapshot`
}

export function lawMarkdownRouteFor(backend: LawBackend, lawId: string): string {
  return `${lawRoutePrefix(backend)}/doc/${encodeURIComponent(lawId)}.md`
}
