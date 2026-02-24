import { ensureFirebaseAdminInitialized, getFirebaseAdminCreds } from '../../../services/push/firebaseAdmin';

export default function handler(req, res) {
    try {
        const creds = getFirebaseAdminCreds();

        const debugInfo = {
            message: "Firebase Environment Variable Debugger",
            environment: process.env.NODE_ENV,
            credentialsStatus: {
                projectId: creds.projectId ? `Present (${creds.projectId})` : 'Missing',
                clientEmail: creds.clientEmail ? `Present (${creds.clientEmail})` : 'Missing',
                privateKeyLength: creds.privateKey ? creds.privateKey.length : 0,
                privateKeyStartsWith: creds.privateKey ? creds.privateKey.substring(0, 27) : 'Missing',
                privateKeyHasNewlines: creds.privateKey ? creds.privateKey.includes('\n') : false,
                privateKeyRawIncludesLiteralSlashN: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.includes('\\n') : false,
            },
            initResult: ensureFirebaseAdminInitialized()
        };

        return res.status(200).json(debugInfo);
    } catch (e) {
        return res.status(500).json({ error: 'Failed to run debug script', details: e.message });
    }
}
