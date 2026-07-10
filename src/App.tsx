import { useState, useEffect, useRef } from 'react';
import './App.css';
import MolstarViewer from './MolstarViewer';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

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
    atom_scale: 1.0,
    bond_width: 5,
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
  });

  const workerRef = useRef<Worker | null>(null);
  const messageIdRef = useRef(0);
  const resolvesRef = useRef<Record<number, (val: any) => void>>({});
  const rejectsRef = useRef<Record<number, (err: any) => void>>({});
  const rotMatrixRef = useRef<number[] | null>(null);

  useEffect(() => {
    // Initialize Web Worker using Vite's BASE_URL with cache busting
    workerRef.current = new Worker(import.meta.env.BASE_URL + 'pyodide-worker.js?v=3');

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

          if (wc.atom_scale === 1.0) delete wc.atom_scale;
          if (wc.bond_width === 5) delete wc.bond_width;
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
    if (config.atom_scale !== 1.0) cmd += ` --atom-scale ${config.atom_scale}`;
    if (config.bond_width !== 5) cmd += ` --bond-width ${config.bond_width}`;
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
                onChange={(e) => setConfig({
                  ...config,
                  preset: e.target.value,
                  atom_scale: 1.0,
                  bond_width: 5
                })}
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

            <label className="slider-label">
              <span>Atom Scale ({config.atom_scale})</span>
              <input
                type="range" min="0.1" max="3.0" step="0.1"
                value={config.atom_scale}
                onChange={(e) => setConfig({ ...config, atom_scale: parseFloat(e.target.value) })}
              />
            </label>

            <label className="slider-label">
              <span>Bond Width ({config.bond_width})</span>
              <input
                type="range" min="1" max="20" step="1"
                value={config.bond_width}
                onChange={(e) => setConfig({ ...config, bond_width: parseFloat(e.target.value) })}
              />
            </label>

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
