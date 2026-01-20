import fs from 'fs';

// Read semantic data
const data = JSON.parse(fs.readFileSync('./public/semantic_data.json', 'utf8'));

// Fix all photo paths
for (const key in data) {
    if (data[key].Photos) {
        data[key].Photos = data[key].Photos.map(path => {
            // Convert backslashes to forward slashes
            let fixed = path.replace(/\\/g, '/');
            // Remove public/ prefix
            fixed = fixed.replace(/^\/?(public\/)?/, '');
            return fixed;
        });
    }
}

// Write back
fs.writeFileSync('./public/semantic_data.json', JSON.stringify(data, null, 2));
console.log('✅ Fixed all photo paths in semantic_data.json');