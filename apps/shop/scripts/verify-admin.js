import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('RUNNING SYSTEM BUILD AND INTEGRITY SANITY CHECK...');
console.log('====================================================');

try {
  console.log('Running: npm run build');
  execSync('npm run build', { stdio: 'inherit', cwd: rootDir });
  console.log('\n====================================================');
  console.log('✅ SANITY CHECK PASSED: Codebase compiled cleanly!');
  console.log('====================================================');
  process.exit(0);
} catch (error) {
  console.error('\n====================================================');
  console.error('❌ SANITY CHECK FAILED: Build errors detected!');
  console.error('====================================================');
  process.exit(1);
}
