import { DebugLevMap, rstypes_ASP, rstypes_Semalogic, rulesettypesCommands, semaLogicCommand } from "const"
import { DebugLevel } from "main"
import { slconsolelog } from "utils"

export interface parseCommand {
    outputformat: string,
    endpoint: string,
    param: string
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
        if (outPutFormat == rulesettypesCommands[rstypes_ASP][1]) {
            const firstJSONBracket = content.indexOf("{")
            content = content.substring(firstJSONBracket, content.length)
        }
        if (outPutFormat == rulesettypesCommands[rstypes_Semalogic][1]) {
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
            if (DebugLevel == DebugLevMap.DebugLevel_Chatty) { console.log("Row before:" + row) }
            row = row.replaceAll(" ", "")
            if (DebugLevel == DebugLevMap.DebugLevel_Chatty) { console.log("Row after:" + row) }
            if (row.indexOf(semaLogicCommand.command_start.toLowerCase()) != 0) { // No starting SemaLogic-Command
                contentCleaned.push(element)
            } else {
                // Starting SemaLogicCommand
                // Test for SemaLogicCommands which should be interpretated by SemaLogicService    
                if (DebugLevel == DebugLevMap.DebugLevel_Chatty) { console.log("Index Define:" + row.indexOf(semaLogicCommand.define).toString()) }
                if (DebugLevel == DebugLevMap.DebugLevel_Chatty) { console.log("Length Start:" + semaLogicCommand.command_start.length.toString()) }
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