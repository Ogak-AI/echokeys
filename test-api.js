#!/usr/bin/env node
/**
 * Quick test script to verify API endpoints work
 * Run: node test-api.js
 */

const http = require('http');

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('Testing API endpoints...\n');

  try {
    console.log('1. Testing /api/init');
    const initRes = await makeRequest('/api/init');
    console.log(`   Status: ${initRes.status}`);
    console.log(`   Response:`, JSON.stringify(initRes.body, null, 2));
    console.log();

    console.log('2. Testing /api/challenge/easy');
    const easyRes = await makeRequest('/api/challenge/easy');
    console.log(`   Status: ${easyRes.status}`);
    if (easyRes.status === 200) {
      console.log(`   Challenge ID: ${easyRes.body.id}`);
      console.log(`   Text length: ${easyRes.body.text.length}`);
      console.log(`   Text preview: ${easyRes.body.text.substring(0, 100)}...`);
    } else {
      console.log(`   Error:`, easyRes.body);
    }
    console.log();

    console.log('3. Testing /api/challenge/medium');
    const mediumRes = await makeRequest('/api/challenge/medium');
    console.log(`   Status: ${mediumRes.status}`);
    if (mediumRes.status === 200) {
      console.log(`   Challenge ID: ${mediumRes.body.id}`);
      console.log(`   Text length: ${mediumRes.body.text.length}`);
    } else {
      console.log(`   Error:`, mediumRes.body);
    }
    console.log();

    console.log('4. Testing /api/challenge/hard');
    const hardRes = await makeRequest('/api/challenge/hard');
    console.log(`   Status: ${hardRes.status}`);
    if (hardRes.status === 200) {
      console.log(`   Challenge ID: ${hardRes.body.id}`);
      console.log(`   Text length: ${hardRes.body.text.length}`);
    } else {
      console.log(`   Error:`, hardRes.body);
    }
  } catch (error) {
    console.error('Error testing API:', error.message);
    console.error('Make sure the server is running on port 3001');
  }

  process.exit(0);
}

test();
