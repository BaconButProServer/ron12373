const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const base64urlDecode = (str) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64').toString('utf-8');
};

const fireBeacon = async (url) => {
    try {
        const fetch = (await import('node-fetch')).default;
        await fetch(url, { method: 'GET', timeout: 5000 });
    } catch (e) {}
};

app.get('/bypass', async (req, res) => {
    const { tc, TID, KEY } = req.query;
    
    if (!tc || !TID || !KEY) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters: tc, TID, KEY'
        });
    }

    try {
        const decodedTID = base64urlDecode(TID);
        const decodedKEY = base64urlDecode(KEY);
        const decodedData = base64urlDecode(tc);
        
        const tcData = JSON.parse(decodedData);
        
        if (!tcData[0]?.urid) {
            return res.status(400).json({
                success: false,
                error: 'Invalid token data structure'
            });
        }

        const { urid, task_id, session_id, action_pixel_url } = tcData[0];
        const shard = parseInt(urid.slice(-5)) % 3;
        
        const wsUrl = `wss://${shard}.onsultingco.com/c?uid=${urid}&cat=${task_id}&key=${decodedKEY}&session_id=${session_id}&is_loot=true&tid=${decodedTID}`;
        const ws = new WebSocket(wsUrl);
        
        let responded = false;
        let timeoutHandle;

        timeoutHandle = setTimeout(() => {
            if (!responded) {
                responded = true;
                ws.terminate();
                res.status(408).json({
                    success: false,
                    error: 'Connection timeout'
                });
            }
        }, 10000);

        ws.on('open', async () => {
            ws.send("0");
            
            const beacons = [
                `https://${shard}.onsultingco.com/st?uid=${urid}&cat=${task_id}`,
                `https:${action_pixel_url}`,
                `https://nerventualken.com/td?ac=auto_complete&urid=${urid}&cat=${task_id}&tid=${decodedTID}`
            ];
            
            for (const beacon of beacons) {
                fireBeacon(beacon);
            }
            
            ws.close();
            clearTimeout(timeoutHandle);
            
            res.json({
                success: true,
                message: "success send WS"
            });
        });

        ws.on('error', (error) => {
            if (!responded) {
                responded = true;
                clearTimeout(timeoutHandle);
                
                res.status(500).json({
                    success: false,
                    error: 'WebSocket connection error: ' + error.message
                });
            }
        });

        ws.on('close', () => {
            clearTimeout(timeoutHandle);
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Fatal error: ' + error.message
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API running on port ${PORT}`);
});

module.exports = app;
