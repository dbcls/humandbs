const esbuild = require('esbuild');
const fs = require('fs');

const code = fs.readFileSync('apps/frontend/src/components/FrontStatsVisualizationNew.tsx', 'utf8');

try {
  esbuild.transformSync(code, { loader: 'tsx' });
  console.log("No syntax errors found by esbuild!");
} catch (e) {
  console.error("Syntax Error found!");
  console.error(e);
}
