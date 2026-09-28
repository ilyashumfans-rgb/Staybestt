const fs = require('fs');
const path = require('path');

const files = [
  'artifacts/staybest-mobile/app/index.tsx',
  'artifacts/staybest-mobile/app/welcome.tsx',
  'artifacts/staybest-mobile/app/(auth)/sign-in.tsx',
  'artifacts/staybest-mobile/app/(tabs)/index.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Clean trailing whitespaces
  content = content.replace(/[ \t]+$/gm, '');
  
  // Replace remote Google SVG in sign-in.tsx
  if (file.includes('sign-in.tsx')) {
    if (!content.includes("import { Feather, AntDesign }")) {
       content = content.replace("import { Feather } from '@expo/vector-icons';", "import { Feather, AntDesign } from '@expo/vector-icons';");
    }
    const oldGoogleImage = `<Image\n              source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg' }}\n              style={styles.googleIcon}\n              contentFit="contain"\n            />`;
    const newGoogleImage = `<AntDesign name="google" size={24} color={colors.foreground} />`;
    content = content.replace(oldGoogleImage, newGoogleImage);
  }
  
  fs.writeFileSync(file, content);
});

console.log("Cleaned");
