import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [status, setStatus] = useState("Initializing Pyodide...");
  const [svgOutput, setSvgOutput] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("molecule.xyz");
  const [config, setConfig] = useState({
    atom_scale: 1.0,
    bond_width: 5.0,
    background: "#ffffff",
    transparent: false,
    orient: true,
  });

  const workerRef = useRef<Worker | null>(null);
  const messageIdRef = useRef(0);
  const resolvesRef = useRef<Record<number, (val: any) => void>>({});
  const rejectsRef = useRef<Record<number, (err: any) => void>>({});

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker('/pyodide-worker.js');

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

    workerRef.current.postMessage({
      type: "RENDER",
      id,
      data: {
        fileContent,
        filename,
        config
      }
    });

    try {
      const svg = await promise;
      setSvgOutput(svg);
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
        await writable.write(svgOutput);
        await writable.close();
      } else {
        // Fallback for browsers that don't support the File System Access API
        const blob = new Blob([svgOutput], { type: 'image/svg+xml' });
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

  return (
    <div className="app-container">
      <header className="header">
        <h1>xyzrender web</h1>
        <p className="status-badge">{status}</p>
      </header>
      
      <main className="main-content">
        <aside className="sidebar">
          <div className="control-group">
            <h3>Upload Molecule</h3>
            <label className="file-upload">
              <input type="file" accept=".xyz,.cube,.sdf,.mol" onChange={handleFileUpload} />
              <span>Choose File</span>
            </label>
          </div>

          <div className="control-group">
            <h3>Render Settings</h3>
            
            <label className="slider-label">
              <span>Atom Scale ({config.atom_scale})</span>
              <input 
                type="range" min="0.1" max="3.0" step="0.1" 
                value={config.atom_scale}
                onChange={(e) => setConfig({...config, atom_scale: parseFloat(e.target.value)})}
              />
            </label>

            <label className="slider-label">
              <span>Bond Width ({config.bond_width})</span>
              <input 
                type="range" min="1" max="20" step="1" 
                value={config.bond_width}
                onChange={(e) => setConfig({...config, bond_width: parseFloat(e.target.value)})}
              />
            </label>

            <label className="color-label">
              <span>Background Color</span>
              <input 
                type="color" 
                value={config.background}
                onChange={(e) => setConfig({...config, background: e.target.value})}
              />
            </label>

            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={config.transparent}
                onChange={(e) => setConfig({...config, transparent: e.target.checked})}
              />
              <span>Transparent Background</span>
            </label>

            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={config.orient}
                onChange={(e) => setConfig({...config, orient: e.target.checked})}
              />
              <span>Auto-orient</span>
            </label>
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
          </div>
          <textarea 
            className="code-editor"
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            disabled={!fileContent && !filename}
            placeholder="Upload a file or paste molecule data here..."
          />
        </section>

        <section className="preview-area">
          {svgOutput ? (
            <div className="svg-container" dangerouslySetInnerHTML={{ __html: svgOutput }} />
          ) : (
            <div className="placeholder">
              <p>Upload or paste a molecule and click Render</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
