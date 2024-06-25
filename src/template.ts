import { Vault, normalizePath } from "obsidian";
import { slTemplate } from "./const"

export async function createTemplateFolder(vault: Vault) {

    const templ = {
        folder: [
            {
                name: slTemplate["PathCommands"],
                files: [
                    {
                        name: "SL_Transfer",
                        content: "SemaLogic(transfer %1 to endpoint %2 with param %3 )"
                    },
                    {
                        name: "SL_ShowHelp",
                        content: "SemaLogic(show help)"
                    },
                    {
                        name: "SL_ShowVersion",
                        content: "SemaLogic(show version)"
                    },
                    {
                        name: "SL_TableDefine",
                        content: "SemaLogic(define table)"
                    },
                    {
                        name: "SL_Show",
                        content: "SemaLogic(show as %1 for %2)"
                    }
                ]
            },
            {
                name: slTemplate["PathSymTokenComparison"],
                files: [
                    {
                        name: "SymTokenCompEqual",
                        content: "=="
                    },
                    {
                        name: "SymTokenCompGreater",
                        content: ">"
                    },
                    {
                        name: "SymTokenCompGreaterEqual",
                        content: ">="
                    },
                    {
                        name: "SymTokenCompLess",
                        content: "<"
                    },
                    {
                        name: "SymTokenCompLessEqual",
                        content: "<="
                    },
                    {
                        name: "SymTokenCompNotEqual",
                        content: "!="
                    }
                ]
            },
            {
                name: slTemplate["PathSymTokenElements"],
                files: [
                    {
                        name: "SymTokenAnnounced",
                        content: "%"
                    },
                    {
                        name: "SymTokenAttribute",
                        content: "$"
                    },
                    {
                        name: "SymTokenCommentEnd",
                        content: "*/"
                    },
                    {
                        name: "SymTokenCommentStart",
                        content: "/*"
                    },
                    {
                        name: "SymTokenElement",
                        content: ","
                    },
                    {
                        name: "SymTokenEOL",
                        content: "\n"
                    },
                    {
                        name: "SymTokenEoS",
                        content: ";"
                    },
                    {
                        name: "SymTokenEqual",
                        content: "≡"
                    },
                    {
                        name: "SymTokenFilter",
                        content: "▼"
                    },
                    {
                        name: "SymTokenGlobalMax",
                        content: "+∞"
                    },
                    {
                        name: "SymTokenGlobalMin",
                        content: "-∞"
                    },
                    {
                        name: "SymTokenIDDevider",
                        content: "."
                    },
                    {
                        name: "SymTokenInstance",
                        content: "@"
                    },
                    {
                        name: "SymTokenInterval",
                        content: "|"
                    },
                    {
                        name: "SymTokenLimit",
                        content: "Ł"
                    },
                    {
                        name: "SymTokenLineComment",
                        content: "//"
                    },
                    {
                        name: "SymTokenReverseIDDevider",
                        content: ":"
                    },
                    {
                        name: "SymTokenSpace",
                        content: " "
                    },
                    {
                        name: "SymTokenVersion",
                        content: "#"
                    }
                ]
            },
            {
                name: slTemplate["PathSymTokenFunc"],
                files: [
                    {
                        name: "FuncTokenCount",
                        content: "Count"
                    },
                    {
                        name: "FuncTokenMax",
                        content: "Max"
                    },
                    {
                        name: "FuncTokenMean",
                        content: "Mean"
                    },
                    {
                        name: "FuncTokenMin",
                        content: "Min"
                    },
                    {
                        name: "FuncTokenSum",
                        content: "Sum"
                    },
                    {
                        name: "FuncTokenUnDef",
                        content: "_FuncUndef"
                    }
                ]
            },
            {
                name: slTemplate["PathSymTokenMath"],
                files: [
                    {
                        name: "SymTokenFunctionClose",
                        content: ")"
                    },
                    {
                        name: "SymTokenFunctionOpen",
                        content: "("
                    },
                    {
                        name: "SymTokenOpDivide",
                        content: "/"
                    },
                    {
                        name: "SymTokenOpMinus",
                        content: "-"
                    },
                    {
                        name: "SymTokenOpMultiply",
                        content: "*"
                    },
                    {
                        name: "SymTokenOpPlus",
                        content: "+"
                    }
                ]
            },
            {
                name: slTemplate["PathSymTokenRefToken"],
                files: [
                    {
                        name: "RefTokenAll",
                        content: "All"
                    },
                    {
                        name: "RefTokenAnnounced",
                        content: "Announced"
                    },
                    {
                        name: "RefTokenChild",
                        content: "Child"
                    },
                    {
                        name: "RefTokenLeaf",
                        content: "Leaf"
                    },
                    {
                        name: "RefTokenRange",
                        content: "Range"
                    },
                    {
                        name: "RefTokenThis",
                        content: "This"
                    },
                    {
                        name: "RefTokenUnder",
                        content: "Under"
                    },
                    {
                        name: "RefTokenUsed",
                        content: "Used"
                    },
                    {
                        name: "RefTokenValue",
                        content: "Value"
                    }
                ]
            },
            {
                name: slTemplate["PathSymTokenTerms"],
                files: [
                    {
                        name: "SymTokenAdviceClose",
                        content: "!"
                    },
                    {
                        name: "SymTokenAdviceOpen",
                        content: "¡"
                    },
                    {
                        name: "SymTokenAndClose",
                        content: "]"
                    },
                    {
                        name: "SymTokenAndOpen",
                        content: "["
                    },
                    {
                        name: "SymTokenCheckClose",
                        content: "?"
                    },
                    {
                        name: "SymTokenCheckOpen",
                        content: "¿"
                    },
                    {
                        name: "SymTokenDialectDefine",
                        content: "≡"
                    },
                    {
                        name: "SymTokenEqual",
                        content: ":="
                    },
                    {
                        name: "SymTokenGroup",
                        content: "~"
                    },
                    {
                        name: "SymTokenOrClose",
                        content: "}"
                    },
                    {
                        name: "SymTokenOrOpen",
                        content: "{"
                    },
                    {
                        name: "SymTokenTimeAfter",
                        content: "⇽"
                    },
                    {
                        name: "SymTokenTimeBefore",
                        content: "⇾"
                    },
                    {
                        name: "SymTokenTimeParallelAfter",
                        content: "⥢"
                    },
                    {
                        name: "SymTokenTimeParallelBefore",
                        content: "⥤"
                    }
                ]
            }
        ]
    }


    for (var myfolder = 0; myfolder < templ.folder.length; myfolder++) {
        for (var myfile = 0; myfile < templ.folder[myfolder].files.length; myfile++) {

            vault.createFolder(templ.folder[myfolder].name)
                .catch((error) => console.log(error))
            vault.create(
                normalizePath(templ.folder[myfolder].name + "/" + templ.folder[myfolder].files[myfile].name + ".md"),
                templ.folder[myfolder].files[myfile].content
            )
                .catch((error) => console.log(error))
        }
    }
}


