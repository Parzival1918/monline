# monline

<p align="center">
  <img src="public/favicon.svg" alt="monline logo" width="128" />
</p>

**monline** is a beautiful, web-native molecular visualization tool powered by [xyzrender](https://github.com/aligfellow/xyzrender) and Pyodide.

It allows you to instantly render `.xyz` files directly in your browser without any server-side dependencies. By running `xyzrender` in a WebAssembly Python environment, **monline** provides high-quality SVG vector outputs of molecular structures and periodic crystal lattices.

## Features

- **Browser-Native Rendering:** Uses Pyodide to run `xyzrender` entirely in the client. No data leaves your browser.
- **Dynamic Styling Controls:** Adjust atom scaling, bond widths, and styling parameters on the fly.
- **Manual 3D Orientation:** Interactive X, Y, and Z rotation sliders to precisely control the camera angle, with full support for periodic bounding boxes.
- **Depth Fog:** Add realistic depth to large molecules using dynamic fog shading.
- **Copy CLI Command:** Automatically generates the exact `xyzrender` command line arguments needed to reproduce your current render in the terminal.
- **SVG Download:** Export your pristine vector renders to SVG with one click.

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Drag and drop a `.xyz` file into the editor, or write one manually!

## License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for more details.
