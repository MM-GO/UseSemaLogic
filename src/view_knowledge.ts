import { ItemView, WorkspaceLeaf, TFile, normalizePath } from "obsidian";
import { DebugLevMap, slTexts } from "./const";
import { SemaLogicPluginComm } from "../main";
import { slconsolelog } from "./utils";

export const KnowledgeViewType = "KnowledgeView";

export class KnowledgeView extends ItemView {
  slComm: SemaLogicPluginComm;
  LastRequestTime: number = 0;
  headerEl: HTMLElement;
  resultEl: HTMLElement;
  canvasPath: string = "SemaLogic/KnowledgeGraph.canvas";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.navigation = true;
    this.setNewKnowledgeInitial(true);
  }

  public setComm(comm: SemaLogicPluginComm) {
    this.slComm = comm;
    this.setNewKnowledgeInitial(false);
  }

  getViewType() {
    return KnowledgeViewType;
  }

  getDisplayText() {
    return KnowledgeViewType;
  }

  onload(): void {
    this.navigation = true;
    this.contentEl.contentEditable = "true";
  }

  public setNewKnowledgeInitial(now: boolean) {
    if (now || this.headerEl == undefined) {
      this.contentEl.empty();
      this.headerEl = this.contentEl.createEl("h4", { text: slTexts["HeaderKnowledge"] });
      this.resultEl = this.contentEl.createEl("div");
    }
  }

  async renderKnowledge(result: string, requestTime: number) {
    if (this.LastRequestTime != requestTime) {
      slconsolelog(DebugLevMap.DebugLevel_Current_Dev, this.slComm?.slview, `Old_Knowledge-Request: ${requestTime} vs ${this.LastRequestTime}`);
      return;
    }
    const file = await this.ensureCanvasFile(result);
    await this.ensureCanvasLeaf(file);
  }

  async onOpen() {
    // nothing
  }

  async onClose() {
    // nothing
  }

  onunload(): void {
    if (this.slComm != undefined) {
      this.slComm.slPlugin.myStatus.setText("Knowledge is off");
    }
  }

  private async ensureCanvasFile(content: string): Promise<TFile> {
    const path = normalizePath(this.canvasPath);
    const folder = path.split("/").slice(0, -1).join("/");
    if (folder.length > 0 && this.app.vault.getAbstractFileByPath(folder) == null) {
      await this.app.vault.createFolder(folder);
    }

    let file = this.app.vault.getAbstractFileByPath(path);
    if (file == null) {
      file = await this.app.vault.create(path, content);
    } else {
      await this.app.vault.modify(file as TFile, content);
    }
    return file as TFile;
  }

  private async ensureCanvasLeaf(file: TFile): Promise<void> {
    await this.leaf.openFile(file, { active: false });
  }
}
