importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js");

let pyodideReadyPromise;
let pyodideInstance;

async function initPyodide() {
  self.postMessage({ type: "status", text: "Loading Pyodide core..." });
  pyodideInstance = await loadPyodide();

  self.postMessage({ type: "status", text: "Loading Python packages..." });
  await pyodideInstance.loadPackage("micropip");
  const micropip = pyodideInstance.pyimport("micropip");

  // Install dependencies that Pyodide can handle
  await micropip.install(["numpy", "Pillow", "networkx", "cclib"]);

  // We need to mock cairosvg and resvg-py as they are C/Rust dependencies 
  // that xyzrender tries to import for PNG conversion.
  // We only care about SVG export in the browser.
  pyodideInstance.runPython(`
import sys
from unittest.mock import MagicMock
sys.modules['cairosvg'] = MagicMock()
sys.modules['resvg'] = MagicMock()
sys.modules['resvg_py'] = MagicMock()
sys.modules['rdkit'] = MagicMock()
sys.modules['rdkit.Chem'] = MagicMock()
  `);

  self.postMessage({ type: "status", text: "Installing xyzrender..." });
  try {
    // Install the dummy rdkit to satisfy xyzgraph dependency
    await micropip.install(location.origin + "/rdkit-999.9.9-py3-none-any.whl");
    // Force absolute path and fix wheel name with cache busting
    await micropip.install(location.origin + "/xyzrender-0.3.1-py3-none-any.whl?v=2");
  } catch (e) {
    self.postMessage({ type: "ERROR", id: -1, error: "Install failed: " + e.toString() });
    throw e;
  }

  self.postMessage({ type: "status", text: "Pyodide is ready!" });
  return pyodideInstance;
}

pyodideReadyPromise = initPyodide();

self.onmessage = async (event) => {
  const { type, id, data } = event.data;

  if (type === "RENDER") {
    try {
      const pyodide = await pyodideReadyPromise;
      
      const { fileContent, filename, config } = data;

      // Write the uploaded file to the Pyodide virtual filesystem
      pyodide.FS.writeFile(filename, fileContent);

      // Extract config parameters
      const styleConfig = config || {};
      const configJson = JSON.stringify(styleConfig);

      // Run xyzrender python code
      pyodide.globals.set("filename", filename);
      pyodide.globals.set("config_json", configJson);

      const pythonCode = `
import json
from xyzrender.api import load, render

config_dict = json.loads(config_json)
mol = load(filename)
svg_string = str(render(mol, **config_dict))
svg_string
`;
      const svgString = await pyodide.runPythonAsync(pythonCode);

      self.postMessage({ type: "RESULT", id, svg: svgString });
    } catch (error) {
      self.postMessage({ type: "ERROR", id, error: error.toString() });
    }
  }
};
