import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import 'molstar/lib/mol-plugin-ui/skin/light.scss';

interface MolstarViewerProps {
  fileContent: string | null;
  filename: string;
  showUnitCell?: boolean;
  onRotationChange: (rotMatrix: number[]) => void;
}

const captureCameraState = (plugin: PluginUIContext, onRotationChange: (matrix: number[]) => void) => {
  const state = plugin.canvas3d?.camera.state;
  if (state) {
    const { position, target, up } = state;
    
    // Z = pos - target
    const zx = position[0] - target[0];
    const zy = position[1] - target[1];
    const zz = position[2] - target[2];
    const zLen = Math.sqrt(zx*zx + zy*zy + zz*zz) || 1;
    const Z = [zx/zLen, zy/zLen, zz/zLen];

    // X = up x Z
    const xx = up[1]*Z[2] - up[2]*Z[1];
    const xy = up[2]*Z[0] - up[0]*Z[2];
    const xz = up[0]*Z[1] - up[1]*Z[0];
    const xLen = Math.sqrt(xx*xx + xy*xy + xz*xz) || 1;
    const X = [xx/xLen, xy/xLen, xz/xLen];

    // Y = Z x X
    const yx = Z[1]*X[2] - Z[2]*X[1];
    const yy = Z[2]*X[0] - Z[0]*X[2];
    const yz = Z[0]*X[1] - Z[1]*X[0];
    const Y = [yx, yy, yz];

    // Matrix [X, Y, Z] transposed
    onRotationChange([
      X[0], X[1], X[2],
      Y[0], Y[1], Y[2],
      Z[0], Z[1], Z[2]
    ]);
  }
};

const MolstarViewer: React.FC<MolstarViewerProps> = ({ fileContent, filename, showUnitCell = false, onRotationChange }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);
  const [pluginReady, setPluginReady] = React.useState(false);

  useEffect(() => {
    if (!parentRef.current) return;

    let isDisposed = false;

    const initMolstar = async () => {
      const plugin = await createPluginUI({
        target: parentRef.current!,
        render: (component, container) => {
          createRoot(container).render(component);
        },
        spec: {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: false,
            }
          }
        }
      });

      if (isDisposed) {
        plugin.dispose();
        return;
      }

      pluginRef.current = plugin;
      setPluginReady(true);

      // Listen to all draw events to guarantee we capture trackball drags
      plugin.canvas3d?.didDraw.subscribe(() => {
        captureCameraState(plugin, onRotationChange);
      });
      // captureRotation is now local to initMolstar. We need to expose it or call it elsewhere if we wanted to.
      // Actually, after applyPreset, the camera moves automatically. The stateChanged will fire.
      // So we don't strictly need to call it manually.
    };

    initMolstar();

    return () => {
      isDisposed = true;
      if (pluginRef.current) {
        pluginRef.current.dispose();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Load structure when fileContent or plugin changes
    if (!pluginReady || !pluginRef.current || !fileContent) return;
    
    const loadStructure = async () => {
      const plugin = pluginRef.current!;
      plugin.clear();
      
      try {
        const data = await plugin.builders.data.rawData({ data: fileContent });
        
        let format: 'xyz' | 'sdf' | 'cube' | 'pdb' | 'cif' = 'xyz';
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext === 'mol' || ext === 'sdf') format = 'sdf';
        else if (ext === 'pdb') format = 'pdb';
        else if (ext === 'cif') format = 'cif';

        const trajectory = await plugin.builders.structure.parseTrajectory(data, format as any);
        await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
        
        if (showUnitCell) {
          const models = plugin.managers.structure.hierarchy.current.models;
          if (models && models.length > 0) {
            await plugin.build().to(models[0].cell).apply(StateTransforms.Representation.ModelUnitcell3D).commit();
          }
        }
        
        // Wait a small tick to ensure camera animations finish setting up
        setTimeout(() => {
          if (pluginRef.current) {
            captureCameraState(pluginRef.current, onRotationChange);
          }
        }, 100);
      } catch (e) {
        console.error("Molstar load error:", e);
      }
    };

    loadStructure();
  }, [fileContent, filename, pluginReady, showUnitCell]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={parentRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />;
};

export default MolstarViewer;
