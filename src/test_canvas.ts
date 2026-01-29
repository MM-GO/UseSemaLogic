import { Vault, normalizePath } from "obsidian";

export async function createTestCanvas(vault: Vault) {
  const canvasFolder = "SemaLogic";
  const hiddenInfoFolder = ".SemaLogic/nodeinfos";
  const infoFilePath = normalizePath(`${hiddenInfoFolder}/test-node.md`);
  const canvasPath = normalizePath(`${canvasFolder}/TestCanvas.canvas`);

  await vault.createFolder(canvasFolder).catch(() => {});
  await vault.createFolder(hiddenInfoFolder).catch(() => {});

  const infoContent = "# Test Tooltip\n- Error 1\n- Error 2\n";
  const existingInfo = vault.getAbstractFileByPath(infoFilePath) as any;
  if (existingInfo == null) {
    await vault.create(infoFilePath, infoContent).catch(() => {});
  } else {
    await vault.modify(existingInfo, infoContent).catch(() => {});
  }

  const canvasJson = {
    nodes: [
      {
        id: "n1",
        type: "text",
        text: "Hello Tooltip",
        x: 0,
        y: 0,
        width: 240,
        height: 80,
        meta: {
          SL_LinkedFile: infoFilePath
        }
      }
    ],
    edges: []
  };

  const existingCanvas = vault.getAbstractFileByPath(canvasPath) as any;
  const canvasContent = JSON.stringify(canvasJson, null, 2);
  if (existingCanvas == null) {
    await vault.create(canvasPath, canvasContent).catch(() => {});
  } else {
    await vault.modify(existingCanvas, canvasContent).catch(() => {});
  }
}
