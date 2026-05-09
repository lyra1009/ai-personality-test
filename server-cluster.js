const cluster = require('cluster');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9010;
const NUM_WORKERS = Math.min(os.cpus().length, 8); // 使用最多8个CPU核心

// MIME类型映射
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// 缓存文件内容
const fileCache = new Map();
const CACHE_MAX_SIZE = 50; // 最多缓存50个文件

function getCachedFile(filePath) {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }
  
  try {
    const content = fs.readFileSync(filePath);
    
    // 如果缓存太大，清理最旧的
    if (fileCache.size >= CACHE_MAX_SIZE) {
      const firstKey = fileCache.keys().next().value;
      fileCache.delete(firstKey);
    }
    
    fileCache.set(filePath, content);
    return content;
  } catch (err) {
    return null;
  }
}

function handleRequest(req, res) {
  // 设置CORS头，允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 设置缓存头，静态资源缓存1小时
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 解析URL
  let url = req.url;
  if (url.includes('?')) {
    url = url.split('?')[0];
  }
  
  // 默认首页
  const filePath = url === '/' ? '/index.html' : url;
  const fullPath = path.join(__dirname, filePath);
  
  // 安全检查：确保请求的文件在目录内
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  // 读取文件（使用缓存）
  const content = getCachedFile(fullPath);
  
  if (content) {
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Content-Length': content.length
    });
    res.end(content);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// 主进程：启动多个工作进程
if (cluster.isMaster) {
  console.log(`主进程 ${process.pid} 正在运行`);
  console.log(`启动 ${NUM_WORKERS} 个工作进程...`);
  
  // 预加载index.html到缓存
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    fileCache.set(indexPath, fs.readFileSync(indexPath));
    console.log('✅ 已预加载 index.html');
  }
  
  // 启动工作进程
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }
  
  // 工作进程崩溃时重启
  cluster.on('exit', (worker, code, signal) => {
    console.log(`工作进程 ${worker.process.pid} 退出，重启中...`);
    cluster.fork();
  });
  
  console.log(`\n🚀 服务器运行在 http://localhost:${PORT}/`);
  console.log(`📱 同一内网可访问: http://${getLocalIP()}:${PORT}/`);
  console.log(`\n💡 提示：按 Ctrl+C 停止服务器\n`);
  
} else {
  // 工作进程：创建HTTP服务器
  const server = http.createServer(handleRequest);
  
  // 设置超时
  server.timeout = 30000; // 30秒超时
  server.keepAliveTimeout = 5000; // 5秒keep-alive
  
  server.listen(PORT, () => {
    console.log(`工作进程 ${process.pid} 已启动`);
  });
}

// 获取本机IP
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
