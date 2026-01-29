import { Vault, normalizePath } from "obsidian";

export async function createTestCanvas(vault: Vault) {
  const canvasFolder = "SemaLogic";
  const hiddenInfoFolder = ".SemaLogic/test_nodeinfos";
  const infoFilePath = normalizePath(`${hiddenInfoFolder}/test-node.md`);
  const dataFilePath = normalizePath(`${hiddenInfoFolder}/test-node-data.md`);
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

  const dataContent = "# Test Data\n- Detail A\n- Detail B\n";
  const existingData = vault.getAbstractFileByPath(dataFilePath) as any;
  if (existingData == null) {
    await vault.create(dataFilePath, dataContent).catch(() => {});
  } else {
    await vault.modify(existingData, dataContent).catch(() => {});
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
          SL_LinkedFile: infoFilePath,
          SL_DataFile: dataFilePath
        }
      },
      {
        id: "n2",
        type: "text",
        text: "Hello Data",
        x: 300,
        y: 0,
        width: 240,
        height: 80,
        meta: {
          SL_DataFile: dataFilePath
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

export async function createTemplateCanvas(vault: Vault) {
  const canvasFolder = "SemaLogic";
  const hiddenInfoFolder = ".SemaLogic/test_nodeinfos";
  const canvasPath = normalizePath(`${canvasFolder}/TemplateCanvas.canvas`);

  await vault.createFolder(canvasFolder).catch(() => {});
  await vault.createFolder(hiddenInfoFolder).catch(() => {});

  const files = [
    {
      path: ".SemaLogic/test_nodeinfos/kitchen-note.md",
      content: "# Kitchen Note (FILE)\n\nThis content is from the linked file, not the node text.\n\n## Errors\n- ERROR: Mock: missing TYPE for Stove\n- ERROR: Mock: duplicate NODEID in Rooms list\n\n## Hints\n- Check OR_MIN/OR_MAX for Liquid∘OR\n"
    },
    {
      path: ".SemaLogic/test_nodeinfos/liquid-note.md",
      content: "# Liquid OR (FILE)\n\nThis content is from the linked file, not the node text.\n\n## Errors\n- ERROR: Mock: OR_MAX missing\n- ERROR: Mock: OR_MIN must be >= 1\n"
    },
    {
      path: ".SemaLogic/test_nodeinfos/price-note.md",
      content: "# Price Assignment (FILE)\n\nThis content is from the linked file, not the node text.\n\n## Errors\n- ERROR: Mock: VALUE_TYPE missing\n- ERROR: Mock: negative VALUE not allowed\n"
    },
    {
      path: ".SemaLogic/test_nodeinfos/house-data.json",
      content: "{\n  \"FILE_ONLY\": \"house-data.json\",\n  \"DATA\": {\n    \"SYMBOL\": [\n      {\n        \"ID\": \"ID-MyHouse-1\",\n        \"NODEID\": \"MyHouse\",\n        \"SYMBOL\": \"MyHouse\",\n        \"VALUE\": \"detached\",\n        \"VALUE_TYPE\": \"string\",\n        \"UNIT\": \"n/a\",\n        \"SOURCE\": \"template\",\n        \"CONFIDENCE\": \"0.84\",\n        \"ASSERTED_BY\": \"demo\",\n        \"TIMESTAMP\": \"2026-01-29T00:00:00Z\"\n      }\n    ],\n    \"TYPE\": [\n      {\n        \"ID\": \"ID-MyHouse-TYPE-1\",\n        \"TARGET_ID\": \"Building\",\n        \"TYPE\": \"Building\",\n        \"AS_DEFINED\": \"true\"\n      }\n    ],\n    \"PART_OF\": [\n      {\n        \"ID\": \"ID-MyHouse-PART-1\",\n        \"TARGET_ID\": \"Neighborhood\",\n        \"PART_OF\": \"Neighborhood\"\n      }\n    ],\n    \"RELATED_TO\": [\n      {\n        \"ID\": \"ID-MyHouse-REL-1\",\n        \"TARGET_ID\": \"Garage\",\n        \"RELATION\": \"near\"\n      }\n    ],\n    \"CONFIDENCE\": [\n      {\n        \"ID\": \"ID-MyHouse-CONF-1\",\n        \"CONFIDENCE\": \"0.84\",\n        \"SOURCE\": \"template\"\n      }\n    ]\n  },\n  \"FORWARD\": {\n    \"AND\": [\n      {\n        \"MyHouse∘AND\": \"NODE_PTR:0x0\",\n        \"ROLE\": \"subject\",\n        \"ORDER\": \"1\",\n        \"AS_DEFINED\": \"true\"\n      }\n    ]\n  },\n  \"BACKWARD\": {\n    \"SYMBOL\": [\n      {\n        \"Kitchen\": \"NODE_PTR:0x0\",\n        \"ROLE\": \"operand\"\n      }\n    ]\n  },\n  \"ERROR\": {\n    \"CONCEPT\": [\n      {\n        \"ERROR\": \"Mock: missing required TYPE for Garage\",\n        \"STATUS\": \"invalid\",\n        \"SOURCE\": \"validator\"\n      }\n    ]\n  }\n}\n"
    },
    {
      path: ".SemaLogic/test_nodeinfos/car-data.json",
      content: "{\n  \"FILE_ONLY\": \"car-data.json\",\n  \"DATA\": {\n    \"SYMBOL\": [\n      {\n        \"ID\": \"ID-Car-1\",\n        \"NODEID\": \"Addition\",\n        \"SYMBOL\": \"Car\",\n        \"VALUE\": \"4\",\n        \"VALUE_TYPE\": \"int\",\n        \"UNIT\": \"count\",\n        \"SOURCE\": \"template\",\n        \"TIMESTAMP\": \"2026-01-29T00:00:00Z\"\n      }\n    ],\n    \"MATH\": [\n      {\n        \"ID\": \"ID-Car-MATH-1\",\n        \"OPERATOR\": \"+\",\n        \"VALUE\": \"4\",\n        \"VALUE_TYPE\": \"int\"\n      }\n    ]\n  },\n  \"FORWARD\": {\n    \"SYMBOL\": [\n      {\n        \"Vehicle\": \"NODE_PTR:0x0\",\n        \"AS_DEFINED\": \"true\"\n      }\n    ]\n  },\n  \"BACKWARD\": {\n    \"TYPE\": [\n      {\n        \"Car∘TYPE\": \"NODE_PTR:0x0\",\n        \"ROLE\": \"subject\"\n      }\n    ]\n  },\n  \"ERROR\": {\n    \"CONCEPT\": [\n      {\n        \"ERROR\": \"Mock: value out of range\",\n        \"STATUS\": \"warning\",\n        \"SOURCE\": \"validator\"\n      }\n    ]\n  }\n}\n"
    }
  ];

  for (const f of files) {
    const p = normalizePath(f.path);
    const existing = vault.getAbstractFileByPath(p) as any;
    if (existing == null) {
      await vault.create(p, f.content).catch(() => {});
    } else {
      await vault.modify(existing, f.content).catch(() => {});
    }
  }

  const dataFiles = [
    { id: "Kitchen", file: ".SemaLogic/test_nodeinfos/kitchen-data.json" },
    { id: "Rooms", file: ".SemaLogic/test_nodeinfos/rooms-data.json" },
    { id: "Stairs", file: ".SemaLogic/test_nodeinfos/stairs-data.json" },
    { id: "Car", file: ".SemaLogic/test_nodeinfos/car-node-data.json" },
    { id: "Car∘TYPE", file: ".SemaLogic/test_nodeinfos/car-data.json" },
    { id: "Vehicle", file: ".SemaLogic/test_nodeinfos/vehicle-data.json" },
    { id: "House", file: ".SemaLogic/test_nodeinfos/house-data.json" },
    { id: "House∘AND", file: ".SemaLogic/test_nodeinfos/house-and-data.json" },
    { id: "084a3dde02011466", file: ".SemaLogic/test_nodeinfos/value2-data.json" },
    { id: "Price∘ASSIGNMENT", file: ".SemaLogic/test_nodeinfos/price-data.json" },
    { id: "Liquid", file: ".SemaLogic/test_nodeinfos/liquid-data.json" },
    { id: "Liquid∘OR", file: ".SemaLogic/test_nodeinfos/liquid-or-data.json" },
    { id: "Milk", file: ".SemaLogic/test_nodeinfos/milk-data.json" },
    { id: "581275de0cfc8acb", file: ".SemaLogic/test_nodeinfos/team-data.json" },
    { id: "2d2146e3b47553b2", file: ".SemaLogic/test_nodeinfos/team-group-data.json" },
    { id: "9a60b2e40aa59e5c", file: ".SemaLogic/test_nodeinfos/member-b-data.json" },
    { id: "8d55e0c369378e10", file: ".SemaLogic/test_nodeinfos/member-a-data.json" },
    { id: "92f71bd69b9476af", file: ".SemaLogic/test_nodeinfos/team-leaf-data.json" }
  ];

  for (const df of dataFiles) {
    const payload = JSON.stringify(
      { FILE_ONLY: df.file, NODE_ID: df.id, SOURCE: "template" },
      null,
      2
    ) + "\n";
    const existing = vault.getAbstractFileByPath(df.file) as any;
    if (existing == null) {
      await vault.create(df.file, payload).catch(() => {});
    } else {
      await vault.modify(existing, payload).catch(() => {});
    }
  }

  const canvasJson = {
    nodes: [
      { id: "Kitchen", type: "text", text: "## NodeID: Kitchen\nCONCEPT: SYMBOL\nERROR: Mock: missing TYPE for Stove", x: -1140, y: 440, width: 260, height: 120, color: "#6FA8DC", meta: { SL_LinkedFile: ".SemaLogic/test_nodeinfos/kitchen-note.md", SL_DataFile: ".SemaLogic/test_nodeinfos/kitchen-data.json" } },
      { id: "Rooms", type: "text", text: "## NodeID: Rooms\nCONCEPT: SYMBOL", x: -900, y: 440, width: 260, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/rooms-data.json" } },
      { id: "Stairs", type: "text", text: "## NodeID: Stairs\nCONCEPT: SYMBOL", x: -660, y: 440, width: 260, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/stairs-data.json" } },
      { id: "Car", type: "text", text: "## NodeID: Addition\nCONCEPT: SYMBOL", x: 360, y: 0, width: 260, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/car-node-data.json" } },
      { id: "Car∘TYPE", type: "text", text: "## NodeID: Car∘MATH\nCONCEPT: MATH\nOPERATOR: +", x: 360, y: 200, width: 260, height: 140, color: "#93C47D", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/car-data.json" } },
      { id: "Vehicle", type: "text", text: "## NodeID: Value1\nCONCEPT: SYMBOL\nVALUE: 4", x: 360, y: 420, width: 260, height: 200, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/vehicle-data.json" } },
      { id: "House", type: "text", text: "## NodeID: MyHouse\nCONCEPT: SYMBOL", x: -1030, y: -600, width: 300, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/house-data.json" } },
      { id: "House∘AND", type: "text", text: "## NodeID: MyHouse∘AND\nCONCEPT: AND", x: -1010, y: -320, width: 370, height: 120, color: "#F6B26B", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/house-and-data.json" } },
      { id: "084a3dde02011466", type: "text", text: "## NodeID: Value2\nCONCEPT: SYMBOL", x: 660, y: 420, width: 260, height: 200, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/value2-data.json" } },
      { id: "Price∘ASSIGNMENT", type: "text", text: "## NodeID: Price∘ASSIGNMENT\nCONCEPT: ASSIGNMENT\nVALUE: 5\nERROR: Mock: VALUE_TYPE missing", x: 660, y: 720, width: 320, height: 180, color: "#B4A7D6", meta: { SL_LinkedFile: ".SemaLogic/test_nodeinfos/price-note.md", SL_DataFile: ".SemaLogic/test_nodeinfos/price-data.json" } },
      { id: "Liquid", type: "text", text: "## NodeID: Liquid\nCONCEPT: SYMBOL", x: -120, y: -220, width: 300, height: 140, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/liquid-data.json" } },
      { id: "Liquid∘OR", type: "text", text: "## NodeID: Liquid∘OR\nCONCEPT: OR\nOR_MIN: <int>\nOR_MAX: <int>\nERROR: Mock: OR_MAX missing", x: -120, y: 0, width: 300, height: 160, color: "#FFD966", meta: { SL_LinkedFile: ".SemaLogic/test_nodeinfos/liquid-note.md", SL_DataFile: ".SemaLogic/test_nodeinfos/liquid-or-data.json" } },
      { id: "Water", type: "text", text: "## NodeID: Water\nCONCEPT: SYMBOL", x: 0, y: 240, width: 220, height: 120, color: "#6FA8DC" },
      { id: "Milk", type: "text", text: "## NodeID: Milk\nCONCEPT: SYMBOL", x: -300, y: 240, width: 220, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/milk-data.json" } },
      { id: "581275de0cfc8acb", type: "text", text: "## NodeID: Team\nCONCEPT: SYMBOL", x: 1100, y: -320, width: 300, height: 140, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/team-data.json" } },
      { id: "2d2146e3b47553b2", type: "text", text: "## NodeID: Team∘GROUP\nCONCEPT: GROUP", x: 1100, y: -100, width: 300, height: 160, color: "#FFD966", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/team-group-data.json" } },
      { id: "9a60b2e40aa59e5c", type: "text", text: "## NodeID: MEMBER B\nCONCEPT: SYMBOL", x: 1220, y: 140, width: 300, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/member-b-data.json" } },
      { id: "8d55e0c369378e10", type: "text", text: "## NodeID: Member A\nCONCEPT: SYMBOL", x: 820, y: 140, width: 320, height: 120, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/member-a-data.json" } },
      { id: "92f71bd69b9476af", type: "text", text: "## NodeID: Team∘LEAF\nCONCEPT: LEAF", x: 1560, y: -100, width: 300, height: 140, color: "#6FA8DC", meta: { SL_DataFile: ".SemaLogic/test_nodeinfos/team-leaf-data.json" } }
    ],
    edges: [
      { id: "House->House∘AND", fromNode: "House", fromSide: "bottom", toNode: "House∘AND", toSide: "top" },
      { id: "House∘AND->Kitchen", fromNode: "House∘AND", fromSide: "bottom", toNode: "Kitchen", toSide: "top" },
      { id: "House∘AND->Rooms", fromNode: "House∘AND", fromSide: "bottom", toNode: "Rooms", toSide: "top" },
      { id: "House∘AND->Stairs", fromNode: "House∘AND", fromSide: "bottom", toNode: "Stairs", toSide: "top" },
      { id: "Liquid->Liquid∘OR", fromNode: "Liquid", fromSide: "bottom", toNode: "Liquid∘OR", toSide: "top" },
      { id: "Liquid∘OR->Milk", fromNode: "Liquid∘OR", fromSide: "bottom", toNode: "Milk", toSide: "top" },
      { id: "Liquid∘OR->Water", fromNode: "Liquid∘OR", fromSide: "bottom", toNode: "Water", toSide: "top" },
      { id: "Car->Car∘TYPE", fromNode: "Car", fromSide: "bottom", toNode: "Car∘TYPE", toSide: "top" },
      { id: "Car∘TYPE->Vehicle", fromNode: "Car∘TYPE", fromSide: "bottom", toNode: "Vehicle", toSide: "top" },
      { id: "04d8896a15577c08", fromNode: "Car∘TYPE", fromSide: "bottom", toNode: "084a3dde02011466", toSide: "top" },
      { id: "653be9449f30aac1", fromNode: "084a3dde02011466", fromSide: "bottom", toNode: "Price∘ASSIGNMENT", toSide: "top" },
      { id: "1f598ed5a361ea28", fromNode: "581275de0cfc8acb", fromSide: "bottom", toNode: "2d2146e3b47553b2", toSide: "top" },
      { id: "fd4430f4602cdb55", fromNode: "2d2146e3b47553b2", fromSide: "bottom", toNode: "8d55e0c369378e10", toSide: "top" },
      { id: "355ee84b5a367f91", fromNode: "2d2146e3b47553b2", fromSide: "bottom", toNode: "9a60b2e40aa59e5c", toSide: "top" },
      { id: "46958cf1a30f7212", fromNode: "581275de0cfc8acb", fromSide: "bottom", toNode: "92f71bd69b9476af", toSide: "top" }
    ]
  };

  const existingCanvas = vault.getAbstractFileByPath(canvasPath) as any;
  const canvasContent = JSON.stringify(canvasJson, null, 2);
  if (existingCanvas == null) {
    await vault.create(canvasPath, canvasContent).catch(() => {});
  } else {
    await vault.modify(existingCanvas, canvasContent).catch(() => {});
  }
}








