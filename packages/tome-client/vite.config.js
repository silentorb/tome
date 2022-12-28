const { defineConfig } = require('vite')
import { resolve } from 'path'

// Currently the only way to see styled component names while debugging is to use a babel plugin.
// Vite doesn't normally need babel.
// In this case babel is only being included for development.
// As babel (like jQuery) is mainly a stop-gap that will ideally be replaced by native alternatives,
// hopefully a more native display name solution will be created for styled components.
// function newReactConfiguration() {
//   return require('@vitejs/plugin-react')({
//     babel: {
//       plugins: [
//         ['babel-plugin-styled-components',
//           {
//             displayName: true,
//             fileName: false
//           },
//         ],
//         // Without this babel can not process the JSON validation metadata
//         ['@babel/plugin-proposal-decorators', { 'legacy': true }],
//       ]
//     }
//   })
// }

module.exports = defineConfig(({ mode }) => {
  const isProd = mode === 'production '
  console.log('isProd', isProd)

  // const reactConfiguration = isProd
  //   ? []
  //   : [newReactConfiguration()]

  return {
    root: './',
    base: './',
    optimizeDeps: {
      include: [
        // 'tome-common',
      ]
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'tome-client',
      // the proper extensions will be added
      fileName: 'tome-client',
    },
    build: {
      sourcemap: true,
      outDir: 'dist/client',
      minify: isProd ? 'esbuild' : undefined,
      manifest: true,
      rollupOptions: {
        input: 'src/main.tsx'
      }
    },
    // plugins: [].concat(reactConfiguration),
  }
})
