export const getImageUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  
  // Strip leading slash if present to avoid double slash
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Use EXPO_PUBLIC_DOMAIN which is set in dev script
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return path; // fallback
  
  return `https://${domain}/${cleanPath}`;
};
