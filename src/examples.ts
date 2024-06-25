import { Vault, normalizePath } from "obsidian";
import { slTemplate } from "./const"

export async function createExamples(vault: Vault) {

    const templ = {
        folder: [
            {
                name: slTemplate["PathExamplesBasic"],
                files: [
                    {
                        name: "00_Overview",
                        content: "In the next exmaple files there are a few and simple examples to use SemaLogic for biulding semantic logical rulesets. " +
                            "In general the examples should show the operating principle opf SemaLogic and have in mind that the characters of the syntax " +
                            "of the technical language could be replaced by formal (more natural) language as it shown in example from 30 up. \n\n" +
                            "0x - 1x: Simple rules and some of the functionalties\n" +
                            "2x - 3x: Cascading rules and combining with functions\n" +
                            "4x - 5x: Formal language examples\n" +
                            "8x     : Additional technical information for values and so on\n " +
                            "9x     : Little Glossar for SymTokens\n\n\n" +
                            "Please keep in mind that this examples are work in progress and we try to expand them to show all the functionality of SemaLogic in future releases of this plugin. \n\n" +
                            "We also working on [our website](www.SemaLogic.de) - which is currently only available in german -  and are writing an official document for all syntax and structures " +
                            "you are able to use in SemaLogic now and about planned funtionalities. But we can not do everything at the same time.\n\n" +
                            "Technical Information for using SemaLogic in obsidian: With ALT + T you can access to the SemaLogicToken-Templates !"
                    },
                    {
                        name: "01_AND-Rules",
                        content: "Defining a simple and-rule in standard technical language : A is true - if B,C and D are true \n\n---\n\nA [B, C, D]\n"
                    },
                    {
                        name: "02_OR-Rules",
                        content: "Defining a simple or-rule in standard technical language : A is true - if B,C or D are true \n\n---\n\n" +
                            "A 1|1 {B, C, D}\n" +
                            "\nIn an OR-Rule it is possible to define how many of the symbols (B,C,D) must be true with the number before and after the pipe-symbol.\n" +
                            "\nE 1|2 {E,F,G}\n" +
                            "\nThis OR-Rule means that one or two of the three symbols (E,F,G) must be true, so that E ist true. " +
                            "If none of the symbols is true or all of them, E will be false as well.\n" +
                            "If you don't use from|to in an or-rule then it is replaced by from one to all symbols - what means that a minimum of one of the symbols has to be true so that E is true. "
                    },
                    {
                        name: "03_Groups",
                        content: "If you don't want to reuse some symbols with in different rule, it it possible to define groups which will be inserted in rules instead of the groups name\n\n---\n\n" +
                            "MyGroup ~ Elem1, Elem2, Elem3 ~\n" +
                            "MyOptions 1|1 {MyGroup}\n"
                    },
                    {
                        name: "04_Dynamic groups",
                        content: "It is also possible to define groups for using them in rules, even if you do not know which symbols are in by using an interval." +
                            "Then the members of the group are defined by the rules dynamically.\n\n---\n\n" +
                            "MyGroup ~ Elem1|Elem4 ~\n" +
                            "Elem2 [A,B]\n" +
                            "ELem4 {C,D}\n" +
                            "MyOptions 1|1 {MyGroup}\n" +
                            "\nIn this case the ruleset only knows the symbols Elem2 and Elem4, which are inherited by the interval from Elem1 till Elem4. So the group is replaced by Eleem2 and Elem4.\n"
                    },
                    {
                        name: "05_Time dependencies",
                        content: "It it possible to define time dependencies for the used symbols. So the results have to be 'time ordered'. \n\n---\n\n" +
                            "A ⇾ B;\n" +
                            "This means that in a solution A must be sorted before B and in combination with time lines it means that A have to be fullfilled completely before B begins.\n\n" +
                            "A ⥤ B;\n" +
                            "This means that in a solution A must be sorted before B and in combination with time lines it means that A have to be fullfilled completely before B ends.\n\n" +
                            "If you want to define this time dependencies vice versa you could use for after ⇽ or for parallel after ⥢.\n"
                    },
                    {
                        name: "10_Values",
                        content: "There are a lot of possibilites to put values to the attributes of a symbol or the symbol itself.\n\n---\n\n" +
                            "A.attrib ≡ 15\n\n" +
                            "This statement will put a value of 15 to the attribute attrib of the symbol A. For example you can define a symbol Germany and put a tax rate to this symbol like Germay.Sales Tax = 19\n"
                    },
                    {
                        name: "15_Using Tables",
                        content: "You can reading tables in many different variants to upload rules and relations \n\n---\n\n   SemaLogic(Define Ntable, header((module_exam_number_…), [exam_number_…]), order(1, 2))\n\n" +
                            "| module_exam_number | exam_number |\n| ------------------ | ----------- |\n| 1032 | 10321 |\n| 1030 | 10311 |\n| 1021 | 10213 |\n| 1021 | 10215 |\n| 1021 | 10216 |\n\n "
                    },
                    {
                        name: "20_Cascading rules",
                        content: "It is possible to cascade rule only by using same symbolname for a new rule : \nA is true - if B or C is true; \nB is true - if B1 or B2 is true\n C is true - if C1 and C2 are true \n\n---\n\nA [B, C]\nB {B1 , B2}\nC [C1 , C2]"
                    },
                    {
                        name: "40_Formal Language",
                        content: "It is possible replace technical Symtokens for using formal language,\nso it ispossible to change dialects as you want with words you use - offical dialects are under development  \n\n---\n\n" +
                            "Das Studium besteht aus einer Abschlussarbeit und umfasst Fachsemester 1 bis Fachsemester 4 als Elemente.\n\n\nSymTokenSpace≡einer \nSymTokenSpace≡Das \nSymTokenInterval≡bis \nSymTokenGroup≡ umfasst\nSymTokenGroup≡ als Elemente\nSymTokenAndOpen≡ besteht aus\nSymTokenElement≡ und\nSymTokenAndClose≡.\n" +
                            "SymTokenOrClose≡.\n"
                    }
                    /*                    {
                                            name: "90_Short Overview Technical Language",
                                            content: "This is a short overview over the main Tokens you could use in SemaLogic and their SymTokens:\n" +
                                        }*/
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


