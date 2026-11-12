import { defineConfig } from 'vite';

// La app tiene los dos modos (pixel y moderno) y se cambian con un botón; esto solo elige
// con cuál arranca la primera vez:
//   npm run build          -> dist/          arranca en pixel ("Cancha arcade")
//   npm run build:moderno  -> dist-moderno/  arranca en moderno
// Las dos se abren con doble clic (file://): rutas relativas y script clásico,
// porque los <script type="module"> no cargan desde file:// en Chrome.
export default defineConfig(({ mode }) => {
  const modern = mode === 'moderno';
  return {
    base: './',
    define: { __THEME__: JSON.stringify(modern ? 'modern' : 'pixel') },
    build: {
      outDir: modern ? 'dist-moderno' : 'dist',
      modulePreload: false,
      rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
    },
    plugins: [{
      name: 'classic-script-for-file-protocol',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer'),
      },
    }],
  };
});
