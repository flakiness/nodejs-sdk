import debug from 'debug';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';

const log = debug('fk:static_server');

export class StaticServer {
  private _server: http.Server;
  private _absoluteFolderPath: string;
  private _pathPrefix: string;
  private _cors?: string;

  private _mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
  };

  constructor(pathPrefix: string, folderPath: string, cors?: string) {
    // Ensure the leading slash and no trailing slashes.
    this._pathPrefix = '/' + pathPrefix.replace(/^\//, '').replace(/\/$/, '');
    this._absoluteFolderPath = path.resolve(folderPath);
    this._cors = cors;
    this._server = http.createServer((req, res) => this._handleRequest(req, res));
  }

  port() {
    const address = this._server.address() as AddressInfo;
    if (!address)
      return undefined;
    return address.port;
  }

  address(): string|undefined {
    const address = this._server.address() as AddressInfo;
    if (!address)
      return undefined;
    // Handle IPv6 display format if needed
    const displayHost = address.address.includes(':') ? `[${address.address}]` : address.address;
    return `http://${displayHost}:${address.port}${this._pathPrefix}`;
  }

  private async _startServer(port: number, host: string): Promise<void> {
    let okListener: () => void;
    let errListener: (err: any) => void;
    const result = new Promise<void>((resolve, reject) => {
      okListener = resolve;
      errListener = reject;
    }).finally(() => {
      this._server.removeListener('listening', okListener);
      this._server.removeListener('error', errListener);
    })
    this._server.once('listening', okListener!);
    this._server.once('error', errListener!);
    this._server.listen(port, host);

    await result;
    log('Serving "%s" on "%s"', this._absoluteFolderPath, (this.address() as string));
  }

  async start(port: number, host: string = '127.0.0.1') {
    if (port === 0) {
      await this._startServer(port, host);
      return this.address() as string
    }
    // Maximum 20 attempts to look for sequential ports.
    for (let i = 0; i < 20; ++i) {
      const err = await this._startServer(port, host).then(() => undefined).catch(e => e);
      if (!err)
        return this.address() as string;

      if (err.code !== 'EADDRINUSE')
        throw err;

      log('Port %d is busy (EADDRINUSE). Trying next port...', port);
      port = port + 1;
      if (port > 65535)
        port = 4000;
    }
    // We failed to find consequtive address; bind to a random port instead.
    log('All sequential ports busy. Falling back to random port.');
    await this._startServer(0, host);
    return this.address() as string;
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._server.close((err) => {
        if (err) {
          log('Error stopping server: %o', err);
          reject(err);
        } else {
          log('Server stopped.');
          resolve();
        }
      });
    });
  }

  private _errorResponse(req: http.IncomingMessage, res: http.ServerResponse, code: number, text: string) {
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    res.end(text);
    log(`[${code}] ${req.method} ${req.url}`);
  }

  private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const { url, method } = req;

    if (this._cors) {
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Origin", this._cors);
      res.setHeader("Access-Control-Allow-Methods", "*");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Only allow GET requests
    if (method !== 'GET') {
      this._errorResponse(req, res, 405, 'Method Not Allowed');
      return;
    }

    req.on('aborted', () => log(`ABORTED ${req.method} ${req.url}`));
    res.on('close', () => {
      if (!res.headersSent) log(`CLOSED BEFORE SEND ${req.method} ${req.url}`);
    });

    // Check if the URL starts with the defined prefix
    if (!url || !url.startsWith(this._pathPrefix)) {
      this._errorResponse(req, res, 404, 'Not Found');
      return;
    }

    // 1. Remove the prefix from the URL to get the relative file path
    const relativePath = url.slice(this._pathPrefix.length);

    // 2. Construct the full file path safely
    // We safeguard against spaces in filenames using decodeURIComponent
    const safeSuffix = path.normalize(decodeURIComponent(relativePath)).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(this._absoluteFolderPath, safeSuffix);

    // 3. SECURITY: Prevent Directory Traversal
    // Ensure the resolved path is still inside the intended root folder
    if (!filePath.startsWith(this._absoluteFolderPath)) {
      this._errorResponse(req, res, 403, 'Forbidden');
      return;
    }

    // 4. Check if file exists and serve it
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        this._errorResponse(req, res, 404, 'File Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = this._mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      log(`[200] ${req.method} ${req.url} -> ${filePath}`);
      // Use streams for memory efficiency
      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
      readStream.on('error', (err) => {
        log('Stream error: %o', err);
        res.end();
      });
    });
  }
}
