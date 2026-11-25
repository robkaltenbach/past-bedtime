import { NES } from '../src/nes/nes.js'; import fs from 'fs';
const n=new NES(); n.load(fs.readFileSync(process.argv[2])); for(let i=0;i<120;i++)n.frame();
const t=performance.now(); for(let i=0;i<600;i++)n.frame(); const ms=(performance.now()-t)/600; console.log(ms.toFixed(2),'ms/frame');
