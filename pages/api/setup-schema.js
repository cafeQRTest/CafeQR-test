import { ensureOrderSchema } from '../../lib/db-setup';

export default async function handler(req, res) {
    try {
        const result = await ensureOrderSchema();
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
