import { requestUrl } from "obsidian"
import { SemaLogicPluginSettings } from "../main"
import { API_Defaults } from "./const"
import { getHostPort } from "./utils"
import { parseRulesout } from "./rulesout"

// WP23a T5 - turning an annotated law document back into Markdown.
//
// The AnnotatedHTML rulesettype is bidirectional: posting annotated HTML answers
// with Markdown, and the direction comes from the input rather than from a flag.
// Nothing is stored (persistency:false), so this needs no SemaLogic session -
// /rules/parse wants a session id, so one constant is used instead of allocating
// one per transfer.
const LawTransferSid = "lawview"

export type LawDeannotateResult = {
  markdown: string
  // The service's own label for what it returned. Anything other than
  // "text/markdown" means it took the *forward* direction: the input was not
  // recognised as annotated, and the result must not be passed off as Markdown.
  mediaType: string
}

export async function deannotateLawHtml(settings: SemaLogicPluginSettings, annotatedHtml: string): Promise<LawDeannotateResult> {
  const profile = settings.mySLSettings[settings.mySetting]
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (profile.myUseHttpsSL && profile.myUserSL != "") {
    headers["Authorization"] = "Basic " + btoa(profile.myUserSL + ":" + profile.myPasswordSL)
  }
  const url = new URL(`${API_Defaults.rules_parse}?sid=${LawTransferSid}`, getHostPort(settings)).toString()
  const response = await requestUrl({
    url,
    method: "POST",
    headers,
    body: JSON.stringify({
      text: [{ textID: "LawView", rules: annotatedHtml }],
      rulesettype: "AnnotatedHTML",
      persistency: false
    }),
    throw: false
  })
  if (response.status < 200 || response.status >= 300) {
    // Named, because a law load talks to three different routes and a bare
    // status leaves the reader guessing which one refused.
    throw new Error(`HTTP ${response.status} von /rules/parse`)
  }
  const rules = parseRulesout(response.text)?.rules
  return {
    markdown: typeof rules?.html == "string" ? rules.html : "",
    mediaType: typeof rules?.mediaType == "string" ? rules.mediaType : ""
  }
}
