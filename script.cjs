const fs = require('fs');

const replaceInFile = (file) => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/bg-zinc-900/g, 'bg-[#162744]');
  content = content.replace(/bg-slate-900/g, 'bg-[#162744]');
  content = content.replace(/hover:bg-zinc-800/g, 'hover:bg-[#0f1b32]');
  content = content.replace(/hover:bg-slate-800/g, 'hover:bg-[#0f1b32]');
  content = content.replace(/border-zinc-900/g, 'border-[#162744]');
  content = content.replace(/shadow-slate-900/g, 'shadow-[#162744]');
  fs.writeFileSync(file, content);
};

const pages = fs.readdirSync('src/pages').filter(f => f.endsWith('.tsx'));
pages.forEach(f => replaceInFile('src/pages/' + f));

replaceInFile('src/components/SecurityWall.tsx');
