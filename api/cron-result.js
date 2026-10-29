import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: "https://canvas-live-result-default-rtdb.firebaseio.com"
    });
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const db = getDatabase();
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        
        let h = now.getHours();
        let m = Math.floor(now.getMinutes() / 15) * 15;
        
        // Check market timing (9:00 AM to 10:00 PM)
        if (h < 9 || h > 22 || (h === 22 && m > 0)) {
            return res.status(200).json({ status: 'Market Closed', time: `${h}:${m}` });
        }

        let hh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        let ampm = h >= 12 ? 'PM' : 'AM';
        let timeString = `${hh}:${m === 0 ? '00' : m} ${ampm}`;
        let todayStr = now.toISOString().split('T')[0];

        const slotRef = db.ref(`results/${todayStr}/${timeString}`);
        const snapshot = await slotRef.once('value');

        if (snapshot.exists()) {
            return res.status(200).json({ status: 'Slot already exists', time: timeString });
        }

        // Fetch blocked numbers from Firebase
        const blockedSnap = await db.ref('blocked_numbers').once('value');
        const blockedData = blockedSnap.val() || {};
        const blockedNumbers = Object.keys(blockedData);

        // Generate balanced random numbers for A, B, C
        const generateNum = () => {
            let numStr;
            let attempts = 0;
            do {
                let randNum = Math.floor(Math.random() * 1000);
                numStr = String(randNum).padStart(3, '0');
                attempts++;
                
                let isBlocked = blockedNumbers.some(b => {
                    if (numStr === b) return true;
                    if (b.length === 2 && (numStr.includes(b) || numStr.endsWith(b) || numStr.startsWith(b))) return true;
                    return false;
                });

                if (!isBlocked || attempts > 30) break;
            } while (true);
            return numStr;
        };

        const valA = generateNum();
        const valB = generateNum();
        const valC = generateNum();

        await slotRef.set({
            A: valA,
            B: valB,
            C: valC
        });

        return res.status(200).json({ 
            success: true, 
            date: todayStr, 
            slot: timeString, 
            result: { A: valA, B: valB, C: valC } 
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
