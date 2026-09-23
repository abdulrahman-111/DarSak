import type { Config } from 'tailwindcss';
export default { content: ['./src/**/*.{ts,tsx}'], theme: { extend: { colors: { cream:'#fbf7ef', teal:'#063b3b', orange:'#e87732', ink:'#173334', muted:'#667b79', line:'#e9e1d5' }, fontFamily:{sans:['Arial','Tahoma','sans-serif']} } }, plugins: [] } satisfies Config;
