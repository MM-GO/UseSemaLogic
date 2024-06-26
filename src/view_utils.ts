import { DebugLevMap, semaLogicCommand, RulesettypesCommands, Rstypes_ASP, Rstypes_Semalogic } from "src/const"
import { DebugLevel } from "../main"
import { slconsolelog } from "src/utils"


export type parseCommand = {
    outputformat: string,
    endpoint: string,
    param: string
}

export interface parseCommands {
    commands: parseCommand[]
}

export class ViewUtils {

    public getContent(contentEl: HTMLElement, outPutFormat: string): string {
        let content: string
        if (contentEl.textContent == null) { content = "" } else { content = contentEl.textContent }
        content = this.cleanContent(content, outPutFormat)
        content = this.cleanCommands(content)
        return content
    }

    cleanContent(content: string, outPutFormat: string): string {
        // Textmanipulation for special outcomes
        if (outPutFormat == RulesettypesCommands[Rstypes_ASP][1]) {
            const firstJSONBracket = content.indexOf("{")
            content = content.substring(firstJSONBracket, content.length)
        }
        if (outPutFormat == RulesettypesCommands[Rstypes_Semalogic][1]) {
            const headerString = "Semalogic Output"
            const firstheaderString = content.indexOf(headerString)
            content = content.substring(firstheaderString + headerString.length, content.length)
        }
        return content
    }

    public cleanCommands(content: string): string {
        let contentCleaned: string[] = []
        let contentArray = content.split('\n')

        contentArray.forEach(element => {
            let row = element.trim()
            row = row.toLowerCase()
            slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "Row before:" + row)
            row = row.replaceAll(" ", "")
            slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "Row after:" + row)
            if (row.indexOf(semaLogicCommand.command_start.toLowerCase()) != 0) { // No starting SemaLogic-Command
                contentCleaned.push(element)
            } else {
                // Starting SemaLogicCommand
                // Test for SemaLogicCommands which should be interpretated by SemaLogicService    
                slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "Index Define:" + row.indexOf(semaLogicCommand.define).toString())
                slconsolelog(DebugLevMap.DebugLevel_Chatty, undefined, "Length Start:" + semaLogicCommand.command_start.length.toString())
                if (row.indexOf(semaLogicCommand.define) == semaLogicCommand.command_start.length) {
                    contentCleaned.push(element)
                }
            }
        })
        content = ""
        contentCleaned.forEach(element => {
            content = content + element + "\n"
        });
        return content
    }
}