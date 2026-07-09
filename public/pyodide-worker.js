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
  await micropip.install(["numpy", "Pillow", "networkx", "cclib", "ase"]);

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
    await micropip.install(new URL("rdkit-999.9.9-py3-none-any.whl", self.location.href).href);
    // Force absolute path and fix wheel name with cache busting
    await micropip.install(new URL("xyzrender-0.3.1-py3-none-any.whl?v=2", self.location.href).href);
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
import numpy as np
from xyzrender.api import load, render, orient

config_dict = json.loads(config_json)
mol = load(filename)

rotX = config_dict.pop('rotX', 0)
rotY = config_dict.pop('rotY', 0)
rotZ = config_dict.pop('rotZ', 0)
rotMatrix = config_dict.pop('rotMatrix', None)

if getattr(mol, 'cell_data', None) is not None:
    # PCA on crystals aligns to atom cloud diagonals, which ruins lattice alignment.
    # Force disable PCA for periodic systems.
    config_dict['orient'] = False

if rotMatrix is not None or rotX != 0 or rotY != 0 or rotZ != 0:
    # Manual rotation overrides auto-orient
    config_dict['orient'] = False

    if rotMatrix is not None:
        R_base = np.array(rotMatrix).reshape(3, 3)
    else:
        R_base = np.eye(3)

    cx, sx = np.cos(np.deg2rad(rotX)), np.sin(np.deg2rad(rotX))
    cy, sy = np.cos(np.deg2rad(rotY)), np.sin(np.deg2rad(rotY))
    cz, sz = np.cos(np.deg2rad(rotZ)), np.sin(np.deg2rad(rotZ))

    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])

    R_sliders = Rz @ Ry @ Rx
    R = R_sliders @ R_base
    
    nodes = list(mol.graph.nodes)
    pos = np.array([mol.graph.nodes[n]['position'] for n in nodes])
    center = pos.mean(axis=0)
    
    pos_rot = (pos - center) @ R.T + center
    
    for i, n in enumerate(nodes):
        mol.graph.nodes[n]['position'] = tuple(pos_rot[i])
        
    if getattr(mol, 'cell_data', None) is not None:
        mol.cell_data.lattice = mol.cell_data.lattice @ R.T
        if mol.cell_data.cell_origin is not None:
            mol.cell_data.cell_origin = (mol.cell_data.cell_origin - center) @ R.T + center
            
    mol.oriented = True

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
