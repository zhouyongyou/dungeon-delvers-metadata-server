#!/usr/bin/env node

const https = require('https');

// Render API 配置
const RENDER_API_URL = 'https://api.render.com/v1';
const SERVICE_ID = 'srv-ctkqjlbtq21c73fdq3lg'; // 你的 Render service ID

console.log('🚀 正在更新 Render 環境變量...');

// 需要更新的環境變量
const envVars = [
    {
        key: 'THE_GRAPH_API_URL',
        value: 'https://api.studio.thegraph.com/query/115633/dungeon-delvers/v2.0.0-new-contracts'
    }
];

function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.render.com',
            port: 443,
            path: `/v1${path}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.RENDER_API_KEY}`,
            }
        };

        if (data) {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || responseData}`));
                    }
                } catch (e) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function updateEnvironmentVariables() {
    if (!process.env.RENDER_API_KEY) {
        console.error('❌ 錯誤: 請設置 RENDER_API_KEY 環境變量');
        console.log('💡 獲取方式: https://dashboard.render.com/account/api-keys');
        process.exit(1);
    }

    try {
        console.log(`📡 連接到服務 ID: ${SERVICE_ID}`);

        // 獲取現有環境變量
        console.log('📋 獲取現有環境變量...');
        const currentEnvVars = await makeRequest('GET', `/services/${SERVICE_ID}/env-vars`);
        
        for (const envVar of envVars) {
            console.log(`🔄 更新 ${envVar.key}...`);
            
            // 查找是否已存在
            const existing = currentEnvVars.find(v => v.key === envVar.key);
            
            if (existing) {
                // 更新現有變量
                await makeRequest('PUT', `/services/${SERVICE_ID}/env-vars/${existing.id}`, {
                    key: envVar.key,
                    value: envVar.value
                });
                console.log(`✅ ${envVar.key} 更新成功`);
            } else {
                // 創建新變量
                await makeRequest('POST', `/services/${SERVICE_ID}/env-vars`, {
                    key: envVar.key,
                    value: envVar.value
                });
                console.log(`✅ ${envVar.key} 創建成功`);
            }
            
            // 等待一下避免 API 限制
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('\n🎉 所有環境變量更新完成！');
        console.log('🚀 Render 將自動重新部署服務...');
        console.log('📊 請查看 Render Dashboard 確認部署狀態');

    } catch (error) {
        console.error('❌ 更新失敗:', error.message);
        process.exit(1);
    }
}

updateEnvironmentVariables();