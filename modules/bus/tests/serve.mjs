import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(decodeURIComponent(new URL('../../../',import.meta.url).pathname).replace(/^\/(.:)/,'$1'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((request,response)=>{const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root)){response.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end('Not found');return;}response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});response.end(data);});}).listen(Number(process.env.PORT||8772),'127.0.0.1');
