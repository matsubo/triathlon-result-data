import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getAllJsonFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files.sort();
}

function testAllJsonFilesAreValid() {
  const repoRoot = resolve(__dirname, '..');
  const jsonFiles = getAllJsonFiles(repoRoot);
  
  const errors = [];
  
  for (const filePath of jsonFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      JSON.parse(content);
    } catch (error) {
      errors.push(`${filePath}: ${error.message}`);
    }
  }
  
  if (errors.length > 0) {
    const formatted = errors.join('\n');
    throw new Error(`Invalid JSON files found:\n${formatted}`);
  }
  
  console.log(`✅ All ${jsonFiles.length} JSON files are valid`);
}

function testRaceInfoPathsExist() {
  const repoRoot = resolve(__dirname, '..');
  const raceInfoPath = join(repoRoot, 'race-info.json');
  
  const content = readFileSync(raceInfoPath, 'utf-8');
  const info = JSON.parse(content);
  
  const missing = [];
  
  for (const event of info.events || []) {
    const image = event.image;
    if (image) {
      try {
        statSync(join(repoRoot, image));
      } catch {
        missing.push(image);
      }
    }
    
    for (const edition of event.editions || []) {
      const weather = edition.weather_file;
      if (weather) {
        try {
          statSync(join(repoRoot, weather));
        } catch {
          missing.push(weather);
        }
      }
      
      for (const category of edition.categories || []) {
        const result = category.result_tsv;
        if (result) {
          try {
            statSync(join(repoRoot, result));
          } catch {
            missing.push(result);
          }
        }
      }
    }
  }
  
  if (missing.length > 0) {
    const formatted = [...new Set(missing)].sort().join('\n');
    throw new Error(`Missing files referenced in race-info.json:\n${formatted}`);
  }
  
  console.log('✅ All paths referenced in race-info.json exist');
}

// Run tests
try {
  console.log('🧪 Running JSON validity tests...');
  testAllJsonFilesAreValid();
  testRaceInfoPathsExist();
  console.log('🎉 All JSON tests passed!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
