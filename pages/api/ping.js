export default function handler(req, res) {
  // Let Vercel’s edge cache absorb most calls
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=604800'
  );
  res.status(204).end(); // No body, returns immediately
}
