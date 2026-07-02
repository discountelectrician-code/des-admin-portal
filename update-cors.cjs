const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'api');
const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(apiDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Add import if not present
  if (!content.includes('corsHeaders')) {
    content = `import { corsHeaders } from '../src/utils/cors.js';\n` + content;
  }

  // Replace old headers
  content = content.replace(/res\.setHeader\('Access-Control-Allow-Origin'.*?\n\s*res\.setHeader\('Access-Control-Allow-Methods'.*?\n\s*res\.setHeader\('Access-Control-Allow-Headers'.*?\n/g, 
    `Object.entries(corsHeaders).forEach(([key, value]) => {\n    res.setHeader(key, value);\n  });\n`);

  // Add OPTIONS export if not present
  if (!content.includes('export async function OPTIONS')) {
    content += `\nexport async function OPTIONS(request: Request) {\n  return new Response(null, { status: 200, headers: corsHeaders });\n}\n`;
  }

  fs.writeFileSync(filePath, content);
}
