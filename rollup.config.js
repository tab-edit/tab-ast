import typescript from '@rollup/plugin-typescript';
import dts from "rollup-plugin-dts";

export default [
    {
        input: 'src/index.ts',
        output: {
            sourcemap: true,
            file: 'dist/index.js',
            format: 'es'
        },
        plugins: [typescript({ tsconfig: "./tsconfig.json" })]
    },
    {
        input: 'dist/dts/index.d.ts',
        output: [
            {file: 'dist/index.d.ts', format: 'es'}
        ],
        plugins: [dts()]
    }
]