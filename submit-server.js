const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9002; // 数据收集服务端口
const DATA_FILE = path.join(__dirname, 'results.json');

// 加载已有数据
let results = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    results = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    results = [];
  }
}

const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 提交结果
  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const record = {
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          ...data
        };
        results.push(record);
        
        // 保存到文件
        fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2));
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, id: record.id }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 获取统计
  if (req.method === 'GET' && req.url === '/stats') {
    const stats = {
      total: results.length,
      byType: {},
      byTime: {}
    };
    
    results.forEach(r => {
      // 按人格类型统计
      if (r.personalityCode) {
        stats.byType[r.personalityCode] = (stats.byType[r.personalityCode] || 0) + 1;
      }
      // 按小时统计
      const hour = r.timestamp.substr(0, 13);
      stats.byTime[hour] = (stats.byTime[hour] || 0) + 1;
    });
    
    res.writeHead(200);
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  // 导出CSV
  if (req.method === 'GET' && req.url === '/export.csv') {
    const headers = ['时间', '姓名', '部门', 'IP地址', '人格代码', '人格名称', '适配指数', 'IP维度', 'SD维度', 'EF维度', 'AC维度'];
    const rows = results.map(r => [
      r.timestamp,
      r.userName || '匿名',
      r.userDept || '-',
      r.ip,
      r.code || r.personalityCode || '',
      r.name || r.personalityName || '',
      r.stars || '',
      r.scores?.IP || '',
      r.scores?.SD || '',
      r.scores?.EF || '',
      r.scores?.AC || ''
    ].map(v => `"${v}"`).join(','));
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=AI人格测评结果.csv');
    res.writeHead(200);
    res.end('\ufeff' + csv); // BOM for Excel
    return;
  }

  // 默认返回说明
  res.writeHead(200);
  res.end(JSON.stringify({
    message: 'AI人格测试数据收集服务',
    endpoints: {
      'POST /submit': '提交测评结果',
      'GET /stats': '查看统计',
      'GET /export.csv': '导出CSV'
    },
    totalResults: results.length
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`数据收集服务运行在 http://localhost:${PORT}/`);
  console.log(`同一内网可访问: http://${getLocalIP()}:${PORT}/`);
  console.log(`\n已有 ${results.length} 条记录\n`);
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('10.') || 
            iface.address.startsWith('172.') || 
            iface.address.startsWith('192.168.')) {
          return iface.address;
        }
      }
    }
  }
  return 'localhost';
}
