import { useState, useEffect, useRef } from 'react';
import './App.css';
import MolstarViewer from './MolstarViewer';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { BENZENE_XYZ, BENZENE_CIF, WATER_XYZ, NACL_CIF, SILICON_CIF } from './examples';

const PRESET_DEFAULTS: Record<string, { scale: number, width: number }> = {
  default: { scale: 2.5, width: 20 },
  vdw: { scale: 10.0, width: 5 },
  flat: { scale: 1.0, width: 5 },
  paton: { scale: 1.0, width: 5 },
  skeletal: { scale: 2.5, width: 14 },
  bubble: { scale: 5.5, width: 5 },
  tube: { scale: 0.0, width: 50 },
  mtube: { scale: 0.0, width: 50 },
  wire: { scale: 0.0, width: 10 },
  graph: { scale: 0.9, width: 8 },
};

const Logo = () => (
  <svg width="46" height="35" viewBox="0 0 130 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 80 L20 30 L45 60 L70 30 L70 80" stroke="var(--primary-color)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="20" cy="80" r="6" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="4" />
    <circle cx="20" cy="30" r="6" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="4" />
    <circle cx="45" cy="60" r="6" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="4" />
    <circle cx="70" cy="30" r="6" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="4" />
    <circle cx="70" cy="80" r="6" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="4" />
    <polygon points="100,45 116,54 116,71 100,81 84,71 84,54" stroke="var(--primary-color)" strokeWidth="6" strokeLinejoin="round" />
    <line x1="90" y1="57" x2="90" y2="68" stroke="var(--primary-color)" strokeWidth="3" strokeLinecap="round" />
    <line x1="100" y1="74" x2="110" y2="68" stroke="var(--primary-color)" strokeWidth="3" strokeLinecap="round" />
    <line x1="110" y1="57" x2="100" y2="52" stroke="var(--primary-color)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="100" cy="45" r="4" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="3" />
    <circle cx="116" cy="54" r="4" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="3" />
    <circle cx="116" cy="71" r="4" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="3" />
    <circle cx="100" cy="81" r="4" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="3" />
    <circle cx="84" cy="71" r="4" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="3" />
    <circle cx="84" cy="54" r="4" fill="var(--panel-bg)" stroke="var(--primary-color)" strokeWidth="3" />
  </svg>
);

function App() {
  const [status, setStatus] = useState("Initializing Pyodide...");
  const [svgOutput, setSvgOutput] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("molecule.xyz");
  const [fileFormat, setFileFormat] = useState<string>("auto");
  const [viewMode, setViewMode] = useState<'interactive' | 'svg'>('interactive');
  const [config, setConfig] = useState({
    preset: "default",
    atom_scale: 2.5,
    bond_width: 20,
    background: "#ffffff",
    transparent: true,
    orientationMode: "auto",
    hide_bonds: false,
    hydrogen_display: "default",
    bo: false,
    fog: false,
    fog_strength: 1.0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    show_unit_cell: false,
    cell_display: "default",
    cell_color: "#000000",
    cell_width: 2.0,
    ghosts_display: "default",
    axes_display: "default",
    supercell: [1, 1, 1],
    highlights: [] as { regions: string, color: string }[],
  });
  const [showExamples, setShowExamples] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const messageIdRef = useRef(0);
  const resolvesRef = useRef<Record<number, (val: any) => void>>({});
  const rejectsRef = useRef<Record<number, (err: any) => void>>({});
  const rotMatrixRef = useRef<number[] | null>(null);

  useEffect(() => {
    // Initialize Web Worker using Vite's BASE_URL with cache busting
    workerRef.current = new Worker(import.meta.env.BASE_URL + 'pyodide-worker.js?v=4');

    workerRef.current.onmessage = (event) => {
      const { type, text, id, svg, error } = event.data;

      if (type === "status") {
        setStatus(text);
      } else if (type === "RESULT") {
        if (resolvesRef.current[id]) {
          resolvesRef.current[id](svg);
          delete resolvesRef.current[id];
          delete rejectsRef.current[id];
        }
      } else if (type === "ERROR") {
        if (rejectsRef.current[id]) {
          rejectsRef.current[id](error);
          delete resolvesRef.current[id];
          delete rejectsRef.current[id];
        }
        setStatus("Error: " + error);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setFileContent(e.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleRender = async () => {
    if (!workerRef.current || !fileContent) return;

    setIsRendering(true);
    setStatus("Rendering...");
    const id = messageIdRef.current++;

    const promise = new Promise<string>((resolve, reject) => {
      resolvesRef.current[id] = resolve;
      rejectsRef.current[id] = reject;
    });

    let actualFilename = filename;
    if (fileFormat !== "auto") {
      actualFilename = `molecule.${fileFormat}`;
    }

    workerRef.current.postMessage({
      type: "RENDER",
      id,
      data: {
        fileContent,
        filename: actualFilename,
        config: (() => {
          const wc: any = { ...config, config: config.preset };
          delete wc.preset;
          delete wc.hydrogen_display;

          if (config.hydrogen_display === "show") wc.hy = true;
          if (config.hydrogen_display === "hide") wc.no_hy = true;

          const presetDefaults = PRESET_DEFAULTS[wc.config] || { scale: 1.0, width: 5 };
          if (wc.atom_scale === presetDefaults.scale) delete wc.atom_scale;
          if (wc.bond_width === presetDefaults.width) delete wc.bond_width;
          if (wc.background === "#ffffff") delete wc.background;
          if (wc.transparent === false) delete wc.transparent;
          if (wc.hide_bonds === false) delete wc.hide_bonds;
          if (wc.bo === false) delete wc.bo;

          if (wc.fog === false) {
            delete wc.fog;
            delete wc.fog_strength;
          } else {
            wc.fog = true;
            if (wc.fog_strength === 1.0) delete wc.fog_strength;
          }

          delete wc.orientationMode;
          if (config.orientationMode === 'auto') {
            wc.orient = true;
            delete wc.rotX; delete wc.rotY; delete wc.rotZ;
          } else if (config.orientationMode === 'sliders') {
            wc.orient = false;
          } else if (config.orientationMode === 'interactive') {
            wc.orient = false;
            delete wc.rotX; delete wc.rotY; delete wc.rotZ;
            if (rotMatrixRef.current) {
              wc.rotMatrix = rotMatrixRef.current;
            }
          }

          // Note: rotX, rotY, rotZ are kept in wc so the worker can use them

          // Force transparent for the UI renderer so the CSS background can handle color changes instantly
          wc.transparent = true;
          delete wc.background; // We handle background in CSS and download
          delete wc.show_unit_cell; // Only used for Interactive UI

          if (config.cell_display === "show") {
            wc.no_cell = false;
            // leave cell_color and cell_width intact from the initial spread
          } else if (config.cell_display === "hide") {
            wc.no_cell = true;
            delete wc.cell_color;
            delete wc.cell_width;
          } else {
            // default
            delete wc.cell_color;
            delete wc.cell_width;
          }
          delete wc.cell_display;

          if (config.ghosts_display === "show") wc.ghosts = true;
          if (config.ghosts_display === "hide") wc.ghosts = false;
          delete wc.ghosts_display;

          if (config.axes_display === "show") wc.axes = true;
          if (config.axes_display === "hide") wc.axes = false;
          delete wc.axes_display;

          if (config.supercell[0] === 1 && config.supercell[1] === 1 && config.supercell[2] === 1) {
            delete wc.supercell;
          }

          if (config.highlights && config.highlights.length > 0) {
            wc.highlight = config.highlights
              .filter(h => h.regions.trim() !== '')
              .map(h => h.color ? [h.regions, h.color] : [h.regions]);
          }
          delete wc.highlights;

          return wc;
        })(),
      },
    });

    try {
      const svg = await promise;
      setSvgOutput(svg);
      setViewMode('svg');
      setStatus("Render complete!");
    } catch (err) {
      console.error(err);
      setStatus("Render failed.");
    } finally {
      setIsRendering(false);
    }
  };

  const handleDownload = async () => {
    if (!svgOutput) return;

    let finalSvg = svgOutput;
    // Inject background rect for download if transparent is disabled
    if (!config.transparent) {
      const rect = `<rect width="100%" height="100%" fill="${config.background}" />`;
      // Find the end of the <svg ...> tag and insert the rect right after it
      finalSvg = finalSvg.replace(/(<svg[^>]*>)/i, `$1\n  ${rect}`);
    }

    try {
      if ('showSaveFilePicker' in window) {
        const defaultName = (filename ? filename.replace(/\.[^/.]+$/, "") : "molecule") + ".svg";
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: 'SVG Image',
            accept: { 'image/svg+xml': ['.svg'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(finalSvg);
        await writable.close();
      } else {
        // Fallback for browsers that don't support the File System Access API
        const blob = new Blob([finalSvg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (filename ? filename.replace(/\.[^/.]+$/, "") : "molecule") + ".svg";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.log("Download cancelled or failed:", err);
    }
  };

  const getCliCommand = () => {
    let cmd = `xyzrender ${filename || "molecule.xyz"}`;
    if (config.preset !== "default") cmd += ` --config ${config.preset}`;
    const presetDefaults = PRESET_DEFAULTS[config.preset] || { scale: 1.0, width: 5 };
    if (config.atom_scale !== presetDefaults.scale) cmd += ` --atom-scale ${config.atom_scale}`;
    if (config.bond_width !== presetDefaults.width) cmd += ` --bond-width ${config.bond_width}`;
    if (!config.transparent && config.background !== "#ffffff") cmd += ` --background "${config.background}"`;
    if (config.transparent) cmd += ` --transparent`;
    if (config.orientationMode === 'auto') cmd += ` --orient`;
    if (config.orientationMode === 'sliders') {
      if (config.rotX !== 0) cmd += ` --rotX ${config.rotX}`;
      if (config.rotY !== 0) cmd += ` --rotY ${config.rotY}`;
      if (config.rotZ !== 0) cmd += ` --rotZ ${config.rotZ}`;
    }
    if (config.hide_bonds) cmd += ` --hide-bonds`;
    if (config.hydrogen_display === "show") cmd += ` --hy`;
    if (config.hydrogen_display === "hide") cmd += ` --no-hy`;
    if (config.bo) cmd += ` --bo`;
    if (config.fog) {
      cmd += ` --fog`;
      if (config.fog_strength !== 1.0) cmd += ` --fog-strength ${config.fog_strength}`;
    }

    if (config.cell_display === "show") {
      cmd += ` --cell`;
      if (config.cell_color !== "#000000") cmd += ` --cell-color "${config.cell_color}"`;
      if (config.cell_width !== 2.0) cmd += ` --cell-width ${config.cell_width}`;
    } else if (config.cell_display === "hide") {
      cmd += ` --no-cell`;
    }

    if (config.ghosts_display === "show") cmd += ` --ghosts`;
    if (config.ghosts_display === "hide") cmd += ` --no-ghosts`;

    if (config.axes_display === "show") cmd += ` --axes`;
    if (config.axes_display === "hide") cmd += ` --no-axes`;

    if (config.supercell[0] !== 1 || config.supercell[1] !== 1 || config.supercell[2] !== 1) {
      cmd += ` --supercell ${config.supercell.join('x')}`;
    }

    if (config.highlights) {
      config.highlights.forEach(h => {
        if (h.regions.trim()) {
          cmd += ` --hl "${h.regions}"`;
          if (h.color) {
            cmd += ` "${h.color}"`;
          }
        }
      });
    }

    return cmd;
  };

  const copyCliCommand = () => {
    navigator.clipboard.writeText(getCliCommand());
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="title-container" style={{ alignItems: 'center', gap: '2px' }}>
          <Logo />
        </div>
        <p className="status-badge">{status}</p>
      </header>

      <main className="main-content">
        <aside className="sidebar">
          <div className="control-group">
            <h3>Upload Molecule</h3>
            <label className="file-upload">
              <input type="file" accept=".xyz,.cube,.sdf,.mol,.pdb,.cif" onChange={handleFileUpload} />
              <span>Choose File</span>
            </label>
            <div style={{ marginTop: '12px' }}>
              <button 
                onClick={() => setShowExamples(!showExamples)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {showExamples ? '▼ Hide Examples' : '▶ Show Examples'}
              </button>
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px', 
                  overflow: 'hidden',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  maxHeight: showExamples ? '200px' : '0',
                  opacity: showExamples ? 1 : 0,
                  marginTop: showExamples ? '8px' : '0'
                }}
              >
                <button 
                  className="example-btn"
                  onClick={() => { setFileContent(BENZENE_XYZ); setFilename('benzene.xyz'); setFileFormat('xyz'); }}
                  style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.75rem' }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                >
                  Benzene Molecule
                </button>
                <button 
                  className="example-btn"
                  onClick={() => { setFileContent(WATER_XYZ); setFilename('water.xyz'); setFileFormat('xyz'); }}
                  style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.75rem' }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                >
                  Water Molecule
                </button>
                <button 
                  className="example-btn"
                  onClick={() => { setFileContent(BENZENE_CIF); setFilename('benzene.cif'); setFileFormat('cif'); }}
                  style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.75rem' }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                >
                  Benzene Crystal
                </button>
                <button 
                  className="example-btn"
                  onClick={() => { setFileContent(NACL_CIF); setFilename('nacl.cif'); setFileFormat('cif'); }}
                  style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.75rem' }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                >
                  NaCl Crystal
                </button>
                <button 
                  className="example-btn"
                  onClick={() => { setFileContent(SILICON_CIF); setFilename('silicon.cif'); setFileFormat('cif'); }}
                  style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.75rem', gridColumn: 'span 2' }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                >
                  Silicon Crystal
                </button>
              </div>
            </div>
          </div>

          <div className="control-group">
            <h3>Orientation</h3>
            <div className="slider-label">
              <span>Mode</span>
              <div className="segmented-control">
                <button
                  className={`segmented-btn ${config.orientationMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setConfig({ ...config, orientationMode: 'auto' })}
                >Auto</button>
                <button
                  className={`segmented-btn ${config.orientationMode === 'sliders' ? 'active' : ''}`}
                  onClick={() => setConfig({ ...config, orientationMode: 'sliders' })}
                >Sliders</button>
                <button
                  className={`segmented-btn ${config.orientationMode === 'interactive' ? 'active' : ''}`}
                  onClick={() => {
                    setConfig({ ...config, orientationMode: 'interactive' });
                    if (viewMode !== 'interactive') {
                      setViewMode('interactive');
                    }
                  }}
                >Interactive</button>
              </div>
            </div>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.show_unit_cell}
                onChange={(e) => setConfig({ ...config, show_unit_cell: e.target.checked })}
              />
              <span>Show Unit Cell (Interactive)</span>
            </label>

            {config.orientationMode === 'sliders' && (
              <>
                <label className="slider-label">
                  <span>Rotation X ({config.rotX}°)</span>
                  <input
                    type="range" min="0" max="360" step="5"
                    value={config.rotX}
                    onChange={(e) => setConfig({ ...config, rotX: parseInt(e.target.value) })}
                  />
                </label>

                <label className="slider-label">
                  <span>Rotation Y ({config.rotY}°)</span>
                  <input
                    type="range" min="0" max="360" step="5"
                    value={config.rotY}
                    onChange={(e) => setConfig({ ...config, rotY: parseInt(e.target.value) })}
                  />
                </label>

                <label className="slider-label">
                  <span>Rotation Z ({config.rotZ}°)</span>
                  <input
                    type="range" min="0" max="360" step="5"
                    value={config.rotZ}
                    onChange={(e) => setConfig({ ...config, rotZ: parseInt(e.target.value) })}
                  />
                </label>

                {(config.rotX !== 0 || config.rotY !== 0 || config.rotZ !== 0) && (
                  <button
                    className="reset-button"
                    onClick={() => setConfig({ ...config, rotX: 0, rotY: 0, rotZ: 0 })}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    Reset Rotation
                  </button>
                )}
              </>
            )}
          </div>

          <div className="control-group">
            <h3>Styling</h3>

            <label className="slider-label">
              <span>Config Preset</span>
              <select
                className="select-input"
                value={config.preset}
                onChange={(e) => {
                  const preset = e.target.value;
                  const defaults = PRESET_DEFAULTS[preset] || { scale: 1.0, width: 5 };
                  setConfig({
                    ...config,
                    preset: preset,
                    atom_scale: defaults.scale,
                    bond_width: defaults.width
                  });
                }}
              >
                <option value="default">Default</option>
                <option value="vdw">VdW</option>
                <option value="flat">Flat</option>
                <option value="paton">Paton</option>
                <option value="skeletal">Skeletal</option>
                <option value="bubble">Bubble</option>
                <option value="tube">Tube</option>
                <option value="mtube">M-Tube</option>
                <option value="wire">Wire</option>
                <option value="graph">Graph</option>
              </select>
            </label>

            <div className="number-input-group">
              <span>Atom Scale</span>
              <div className="number-input-controls">
                <button
                  className="icon-button"
                  onClick={() => setConfig({ ...config, atom_scale: Math.max(0, Math.round((config.atom_scale - 0.1) * 10) / 10) })}
                >
                  -
                </button>
                <input
                  type="number" min="0" step="0.1"
                  value={config.atom_scale}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setConfig({ ...config, atom_scale: Math.max(0, val) });
                  }}
                />
                <button
                  className="icon-button"
                  onClick={() => setConfig({ ...config, atom_scale: Math.round((config.atom_scale + 0.1) * 10) / 10 })}
                >
                  +
                </button>
              </div>
            </div>

            <div className="number-input-group">
              <span>Bond Width</span>
              <div className="number-input-controls">
                <button
                  className="icon-button"
                  onClick={() => setConfig({ ...config, bond_width: Math.max(0, config.bond_width - 1) })}
                >
                  -
                </button>
                <input
                  type="number" min="0" step="1"
                  value={config.bond_width}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setConfig({ ...config, bond_width: Math.max(0, val) });
                  }}
                />
                <button
                  className="icon-button"
                  onClick={() => setConfig({ ...config, bond_width: config.bond_width + 1 })}
                >
                  +
                </button>
              </div>
            </div>

            <label className="color-label">
              <span>Background Color</span>
              <input
                type="color"
                value={config.background}
                onChange={(e) => setConfig({ ...config, background: e.target.value })}
              />
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.transparent}
                onChange={(e) => setConfig({ ...config, transparent: e.target.checked })}
              />
              <span>Transparent Background</span>
            </label>
          </div>

          <div className="control-group">
            <h3>Display</h3>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.hide_bonds}
                onChange={(e) => setConfig({ ...config, hide_bonds: e.target.checked })}
              />
              <span>Hide Bonds</span>
            </label>

            <label className="slider-label">
              <span>Hydrogens</span>
              <select
                className="select-input"
                value={config.hydrogen_display}
                onChange={(e) => setConfig({ ...config, hydrogen_display: e.target.value })}
              >
                <option value="default">Default</option>
                <option value="show">Show All</option>
                <option value="hide">Hide All</option>
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.bo}
                onChange={(e) => setConfig({ ...config, bo: e.target.checked })}
              />
              <span>Show Bond Orders</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.fog}
                onChange={(e) => setConfig({ ...config, fog: e.target.checked })}
              />
              <span>Depth Fog</span>
            </label>


            {config.fog && (
              <label className="slider-label">
                <span>Fog Strength ({config.fog_strength})</span>
                <input
                  type="range" min="0.1" max="5.0" step="0.1"
                  value={config.fog_strength}
                  onChange={(e) => setConfig({ ...config, fog_strength: parseFloat(e.target.value) })}
                />
              </label>
            )}
          </div>

          <div className="control-group">
            <h3>Highlights</h3>
            {config.highlights.map((hl, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="e.g. 1-5,8"
                  value={hl.regions}
                  onChange={(e) => {
                    const newHighlights = [...config.highlights];
                    newHighlights[idx].regions = e.target.value;
                    setConfig({ ...config, highlights: newHighlights });
                  }}
                  style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--panel-bg)', color: 'var(--text-main)', fontSize: '0.875rem' }}
                />
                <input
                  type="color"
                  value={hl.color || '#ff0000'}
                  onChange={(e) => {
                    const newHighlights = [...config.highlights];
                    newHighlights[idx].color = e.target.value;
                    setConfig({ ...config, highlights: newHighlights });
                  }}
                  title="Highlight Color"
                  style={{ width: '32px', height: '32px', padding: '0', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                />
                <button
                  className="icon-button"
                  onClick={() => {
                    const newHighlights = config.highlights.filter((_, i) => i !== idx);
                    setConfig({ ...config, highlights: newHighlights });
                  }}
                  title="Remove"
                  style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setConfig({ ...config, highlights: [...config.highlights, { regions: '', color: '#ff0000' }] })}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              + Add Highlight
            </button>
          </div>

          <div className="control-group">
            <h3>Unit Cell & Axes</h3>

            <label className="slider-label">
              <span>Unit Cell Box</span>
              <select
                className="select-input"
                value={config.cell_display}
                onChange={(e) => setConfig({ ...config, cell_display: e.target.value })}
              >
                <option value="default">Default</option>
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </select>
            </label>

            {config.cell_display === "show" && (
              <>
                <label className="color-label">
                  <span>Cell Color</span>
                  <input
                    type="color"
                    value={config.cell_color}
                    onChange={(e) => setConfig({ ...config, cell_color: e.target.value })}
                  />
                </label>
                <div className="number-input-group">
                  <span>Cell Width</span>
                  <div className="number-input-controls">
                    <button
                      className="icon-button"
                      onClick={() => setConfig({ ...config, cell_width: Math.max(0.1, Math.round((config.cell_width - 0.5) * 10) / 10) })}
                    >
                      -
                    </button>
                    <input
                      type="number" min="0.1" step="0.5"
                      value={config.cell_width}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) setConfig({ ...config, cell_width: Math.max(0.1, val) });
                      }}
                    />
                    <button
                      className="icon-button"
                      onClick={() => setConfig({ ...config, cell_width: Math.round((config.cell_width + 0.5) * 10) / 10 })}
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            )}

            <label className="slider-label">
              <span>Ghost Atoms</span>
              <select
                className="select-input"
                value={config.ghosts_display}
                onChange={(e) => setConfig({ ...config, ghosts_display: e.target.value })}
              >
                <option value="default">Default</option>
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </select>
            </label>

            <label className="slider-label">
              <span>Axes</span>
              <select
                className="select-input"
                value={config.axes_display}
                onChange={(e) => setConfig({ ...config, axes_display: e.target.value })}
              >
                <option value="default">Default</option>
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </select>
            </label>

            <label className="slider-label">
              <span>Supercell</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={config.supercell[0]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val > 0) setConfig({ ...config, supercell: [val, config.supercell[1], config.supercell[2]] });
                  }}
                  style={{ width: '40px', textAlign: 'center', backgroundColor: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px' }}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={config.supercell[1]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val > 0) setConfig({ ...config, supercell: [config.supercell[0], val, config.supercell[2]] });
                  }}
                  style={{ width: '40px', textAlign: 'center', backgroundColor: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px' }}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={config.supercell[2]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val > 0) setConfig({ ...config, supercell: [config.supercell[0], config.supercell[1], val] });
                  }}
                  style={{ width: '40px', textAlign: 'center', backgroundColor: 'var(--panel-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px' }}
                />
              </div>
            </label>
          </div>

          <div className="cli-section">
            <div className="cli-header">
              <span>CLI Equivalent</span>
              <button className="copy-btn" onClick={copyCliCommand} title="Copy to clipboard">
                Copy
              </button>
            </div>
            <pre className="cli-code">{getCliCommand()}</pre>
          </div>

          <div className="button-group">
            <button
              className="render-btn"
              onClick={handleRender}
              disabled={!fileContent || isRendering}
            >
              {isRendering ? "Rendering..." : "Render Image"}
            </button>
            <button
              className="download-btn"
              onClick={handleDownload}
              disabled={!svgOutput || isRendering}
            >
              Download SVG
            </button>
          </div>
        </aside>

        <section className="editor-area">
          <div className="editor-header">
            <h3>File Content</h3>
            <div className="format-selector">
              <label>Format: </label>
              <select value={fileFormat} onChange={(e) => setFileFormat(e.target.value)}>
                <option value="auto">Auto-detect</option>
                <option value="xyz">XYZ</option>
                <option value="cif">CIF</option>
                <option value="pdb">PDB</option>
                <option value="sdf">SDF</option>
                <option value="mol">MOL</option>
                <option value="cube">CUBE</option>
              </select>
            </div>
          </div>
          <textarea
            className="file-input-textarea"
            value={fileContent || ''}
            onChange={(e) => {
              const text = e.target.value;
              setFileContent(text);
              let ext = 'xyz';
              if (text.includes('_cell_length_a') || text.trim().startsWith('data_')) ext = 'cif';
              else if (text.startsWith('HEADER') || text.includes('ATOM  ')) ext = 'pdb';
              else if (text.includes('$$$$') || text.includes('V2000') || text.includes('V3000')) ext = 'sdf';
              setFilename(`molecule.${ext}`);
            }}
            placeholder="Paste a molecule (XYZ, PDB, CIF, SDF) and click Render..."
          />
        </section>

        <section className="preview-area">
          <div className="preview-header">
            <button
              className={`view-toggle ${viewMode === 'interactive' ? 'active' : ''}`}
              onClick={() => setViewMode('interactive')}
            >
              Interactive View
            </button>
            <button
              className={`view-toggle ${viewMode === 'svg' ? 'active' : ''}`}
              onClick={() => {
                if (viewMode !== 'svg') {
                  if (config.orientationMode === 'interactive') {
                    handleRender();
                  } else {
                    setViewMode('svg');
                  }
                }
              }}
            >
              Rendered SVG
            </button>
          </div>
          <div className="preview-content" style={{ position: 'relative' }}>
            <div style={{
              visibility: viewMode === 'interactive' ? 'visible' : 'hidden',
              opacity: viewMode === 'interactive' ? 1 : 0,
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              transition: 'opacity 0.2s',
              zIndex: viewMode === 'interactive' ? 2 : 1
            }}>
              {fileContent ? (
                <MolstarViewer
                  fileContent={fileContent}
                  filename={fileFormat !== "auto" ? `molecule.${fileFormat}` : filename}
                  showUnitCell={config.show_unit_cell}
                  onRotationChange={(matrix) => { rotMatrixRef.current = matrix; }}
                />
              ) : (
                <div className="placeholder">
                  <p>Upload or paste a molecule to align interactively</p>
                </div>
              )}
            </div>
            <div style={{
              visibility: viewMode === 'svg' ? 'visible' : 'hidden',
              opacity: viewMode === 'svg' ? 1 : 0,
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              transition: 'opacity 0.2s',
              zIndex: viewMode === 'svg' ? 2 : 1,
              backgroundColor: config.transparent ? 'transparent' : config.background
            }}>
              {svgOutput ? (
                <TransformWrapper centerOnInit={true} minScale={0.1} maxScale={10} initialScale={1}>
                  <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                    <div className="svg-container" dangerouslySetInnerHTML={{ __html: svgOutput }} />
                  </TransformComponent>
                </TransformWrapper>
              ) : (
                <div className="placeholder">
                  <p>Upload or paste a molecule and click Render</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
